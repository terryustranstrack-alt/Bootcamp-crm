import { NextResponse, type NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import {
  toMessageType,
  verifyWebhookSignature,
  type WhatsappWebhookPayload,
} from "@/lib/whatsapp";
import { storeInboundMedia } from "@/lib/whatsappMedia";
import { logWhatsappActivity } from "@/lib/activity";
import { maybeRunBot } from "@/lib/botRunner";

// Unduh media (bisa lambat) dijalankan lewat after() setelah balas 200 ke
// Meta — beri ruang durasi lebih dari default 10 detik.
export const maxDuration = 60;

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
        // Timestamp asli dari WhatsApp (detik epoch). Dipakai untuk urutan
        // pesan & hitung jendela 24 jam.
        const waTimestamp = new Date(
          Number(message.timestamp) * 1000,
        ).toISOString();

        // Cari apakah sudah ada percakapan dengan nomor pengirim ini.
        const { data: existingConversation } = await admin
          .from("conversations")
          .select("id, status, lead_id")
          .eq("channel", "whatsapp")
          .eq("external_contact_id", message.from)
          .maybeSingle();

        let conversationId: string;
        let conversationLeadId: string | null =
          existingConversation?.lead_id ?? null;

        if (existingConversation) {
          // Sudah ada percakapan — update ringkasannya. unread_count naik
          // otomatis lewat trigger saat pesan di bawah ini di-insert.
          // Kalau percakapan tadinya sudah "resolved", buka lagi (ada pesan baru).
          conversationId = existingConversation.id;
          await admin
            .from("conversations")
            .update({
              display_name: contactName ?? undefined,
              last_message_at: new Date().toISOString(),
              last_message_preview: preview,
              ...(existingConversation.status === "resolved"
                ? { status: "open", resolved_at: null, resolved_by: null }
                : {}),
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
              // unread_count mulai 0 — trigger yang menaikkannya saat pesan di-insert.
              unread_count: 0,
            })
            .select("id")
            .single();

          if (createError || !createdConversation) continue;
          conversationId = createdConversation.id;
          conversationLeadId = matchedLead?.id ?? null;
        }

        // Simpan pesannya sendiri. `upsert` + ignoreDuplicates supaya aman
        // kalau Meta kirim ulang webhook yang sama (retry) — tidak dobel.
        // `.select()` mengembalikan baris HANYA kalau benar-benar baru di-insert
        // (kalau duplikat, hasilnya kosong) — dipakai untuk memutuskan apakah
        // perlu unduh media.
        const { data: insertedMessages } = await admin
          .from("messages")
          .upsert(
            {
              conversation_id: conversationId,
              direction: "inbound",
              wa_message_id: message.id,
              type: messageType,
              text_body: textBody,
              media_id: media?.id ?? null,
              media_mime_type: media?.mime_type ?? null,
              media_status: media ? "pending" : "none",
              status: "sent",
              wa_timestamp: waTimestamp,
              raw: message,
            },
            { onConflict: "wa_message_id", ignoreDuplicates: true },
          )
          .select("id");

        const isNewMessage = (insertedMessages ?? []).length > 0;

        // Pesan media yang baru masuk: unduh filenya & simpan ke Storage
        // setelah respons dikirim (after()), supaya webhook tetap cepat.
        if (isNewMessage && media?.id) {
          after(() =>
            storeInboundMedia(admin, {
              waMessageId: message.id,
              mediaId: media.id,
              mimeType: media.mime_type,
              filename: message.document?.filename ?? null,
            }),
          );
        }

        // Kalau percakapan terhubung ke sebuah lead, catat pesan masuk ini
        // di riwayat aktivitas lead-nya juga (setelah respons, via after()).
        if (isNewMessage && conversationLeadId) {
          const leadId = conversationLeadId;
          after(() => logWhatsappActivity(admin, leadId, preview));
        }

        // Chatbot AI: coba balas otomatis (kalau diaktifkan admin). Jalan
        // setelah respons via after() — panggilan AI bisa 1-2 detik.
        if (isNewMessage) {
          const convId = conversationId;
          after(() => maybeRunBot(admin, convId));
        }
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
