import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import {
  toMessageType,
  verifyWebhookSignature,
  type WhatsappWebhookPayload,
} from "@/lib/whatsapp";

// Meta memanggil GET ini sekali saat kamu set Callback URL di App Dashboard.
// Ini cuma "jabat tangan" verifikasi: balikin apa adanya nilai hub.challenge
// kalau hub.verify_token cocok dengan yang kita set sendiri di env var.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const verifyToken = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    verifyToken === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Teks singkat yang ditampilkan sebagai preview pesan terakhir di daftar
// percakapan (sidebar inbox) — pesan teks dipotong, pesan media diberi label.
function previewFor(messageType: string, textBody?: string): string {
  if (messageType === "text" && textBody) return textBody.slice(0, 200);
  const labels: Record<string, string> = {
    image: "📷 Image",
    document: "📄 Document",
    audio: "🎵 Audio",
    video: "🎥 Video",
    sticker: "🧷 Sticker",
    location: "📍 Location",
  };
  return labels[messageType] ?? "Unsupported message";
}

// Ini endpoint yang dipanggil server Meta setiap ada pesan WhatsApp masuk
// atau update status (terkirim/dibaca/gagal) untuk pesan yang kita kirim.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Pastikan request ini beneran dari Meta (bukan orang lain yang nembak
  // endpoint ini), lewat signature HMAC pakai App Secret.
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WhatsappWebhookPayload;
  // Pakai service-role client karena request ini datang dari server Meta,
  // bukan dari user yang login — tidak ada sesi/cookie untuk lewat RLS biasa.
  const admin = createAdminClient();

  // Payload Meta bisa berisi beberapa "entry" dan "changes" sekaligus dalam
  // satu request (batching), jadi harus diloop semua, bukan cuma ambil yang
  // pertama.
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const changeValue = change.value;
      if (!changeValue) continue;

      // --- Bagian 1: pesan baru yang masuk dari kontak ---
      for (const message of changeValue.messages ?? []) {
        const contactName = changeValue.contacts?.find(
          (contact) => contact.wa_id === message.from,
        )?.profile?.name;
        const messageType = toMessageType(message.type);
        const textBody =
          message.type === "text" ? message.text?.body ?? null : null;
        const media =
          message.image ?? message.document ?? message.audio ?? message.video ??
          message.sticker;
        const preview = previewFor(message.type, textBody ?? undefined);

        // Cari apakah sudah ada percakapan dengan nomor pengirim ini.
        const { data: existingConversation } = await admin
          .from("conversations")
          .select("id, unread_count")
          .eq("channel", "whatsapp")
          .eq("external_contact_id", message.from)
          .maybeSingle();

        let conversationId: string;

        if (existingConversation) {
          // Sudah ada percakapan — tinggal update ringkasan & unread count.
          conversationId = existingConversation.id;
          await admin
            .from("conversations")
            .update({
              display_name: contactName ?? undefined,
              last_message_at: new Date().toISOString(),
              last_message_preview: preview,
              unread_count: existingConversation.unread_count + 1,
            })
            .eq("id", conversationId);
        } else {
          // Kontak baru — buat percakapan baru, dan coba auto-link ke lead
          // yang sudah ada lewat pencocokan nomor telepon (leads.kontak
          // formatnya bebas, jadi disamakan dulu formatnya sebelum dibandingkan).
          const normalizedSenderPhone = normalizePhone(message.from);
          const { data: allLeadsWithContact } = await admin
            .from("leads")
            .select("id, kontak, assigned_to")
            .not("kontak", "is", null);
          const matchedLead = (allLeadsWithContact ?? []).find(
            (lead) => normalizePhone(lead.kontak) === normalizedSenderPhone,
          );

          const { data: createdConversation, error: createError } = await admin
            .from("conversations")
            .insert({
              channel: "whatsapp",
              external_contact_id: message.from,
              display_name: contactName ?? null,
              lead_id: matchedLead?.id ?? null,
              // Kalau ketemu lead, percakapan otomatis "diklaim" oleh sales
              // yang sudah menangani lead itu.
              assigned_to: matchedLead?.assigned_to ?? null,
              last_message_at: new Date().toISOString(),
              last_message_preview: preview,
              unread_count: 1,
            })
            .select("id")
            .single();

          if (createError || !createdConversation) continue;
          conversationId = createdConversation.id;
        }

        // Simpan pesannya sendiri. `upsert` + ignoreDuplicates supaya aman
        // kalau Meta kirim ulang webhook yang sama (retry) — tidak dobel.
        await admin.from("messages").upsert(
          {
            conversation_id: conversationId,
            direction: "inbound",
            wa_message_id: message.id,
            type: messageType,
            text_body: textBody,
            media_id: media?.id ?? null,
            media_mime_type: media?.mime_type ?? null,
            status: "sent",
            raw: message,
          },
          { onConflict: "wa_message_id", ignoreDuplicates: true },
        );
      }

      // --- Bagian 2: update status pesan yang KITA kirim (terkirim/dibaca/gagal) ---
      for (const statusUpdate of changeValue.statuses ?? []) {
        await admin
          .from("messages")
          .update({
            status: statusUpdate.status,
            error_message: statusUpdate.errors?.[0]?.message ?? null,
          })
          .eq("wa_message_id", statusUpdate.id);
      }
    }
  }

  // Selalu balas cepat & 200 — Meta akan retry kalau timeout/non-2xx.
  return NextResponse.json({ received: true });
}
