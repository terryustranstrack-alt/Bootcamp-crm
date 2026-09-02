"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logWhatsappActivity } from "@/lib/activity";
import type { ConversationStatus } from "@/lib/types";
import {
  markMessageRead,
  sendMediaMessage,
  sendTextMessage,
  WhatsappApiError,
  type OutboundMediaType,
} from "@/lib/whatsapp";

export type InboxActionState = { error?: string; success?: boolean } | undefined;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Update ringkasan percakapan setelah sebuah pesan keluar terkirim.
async function touchConversation(
  supabase: ServerClient,
  conversationId: string,
  preview: string,
) {
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview.slice(0, 200),
      unread_count: 0,
    })
    .eq("id", conversationId);
}

// Kirim isi teks sebuah pesan outbound yang sudah tersimpan (status "pending"
// atau "failed") ke WhatsApp, lalu tandai baris pesannya "sent" atau "failed".
// Dipakai bareng oleh sendMessage (pesan baru) dan retryMessage (kirim ulang).
async function deliverText(
  supabase: ServerClient,
  messageId: string,
  to: string,
  text: string,
): Promise<{ error?: string }> {
  try {
    const { waMessageId } = await sendTextMessage(to, text);
    await supabase
      .from("messages")
      .update({ status: "sent", wa_message_id: waMessageId, error_message: null })
      .eq("id", messageId);
    return {};
  } catch (e) {
    // Gagal kirim (mis. sudah lewat 24 jam sejak pesan terakhir kontak, atau
    // kredensial API salah) — tandai gagal, jangan biarkan nyangkut "pending".
    const message =
      e instanceof WhatsappApiError ? e.message : "Failed to send message.";
    await supabase
      .from("messages")
      .update({ status: "failed", error_message: message })
      .eq("id", messageId);
    return { error: message };
  }
}

// Kirim balasan teks WhatsApp dari CRM: simpan pesan "pending" dulu, baru
// kirim beneran, lalu update statusnya.
export async function sendMessage(
  conversationId: string,
  text: string,
): Promise<InboxActionState> {
  const trimmedText = text.trim();
  if (!trimmedText) return { error: "Message cannot be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, external_contact_id, lead_id")
    .eq("id", conversationId)
    .single();

  if (conversationError || !conversation) {
    return { error: "Conversation not found or inaccessible." };
  }

  const { data: insertedMessage, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      type: "text",
      text_body: trimmedText,
      status: "pending",
      sent_by: user.id,
      wa_timestamp: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !insertedMessage) {
    return { error: insertError?.message ?? "Failed to save message." };
  }

  const result = await deliverText(
    supabase,
    insertedMessage.id,
    conversation.external_contact_id,
    trimmedText,
  );
  if (result.error) return { error: result.error };

  await touchConversation(supabase, conversationId, trimmedText);
  if (conversation.lead_id) {
    await logWhatsappActivity(supabase, conversation.lead_id, `→ ${trimmedText}`);
  }
  revalidatePath("/inbox");
  return { success: true };
}

// Kirim ulang sebuah pesan teks outbound yang tadinya gagal.
export async function retryMessage(
  messageId: string,
): Promise<InboxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, conversation_id, direction, type, text_body, status, sent_by")
    .eq("id", messageId)
    .single();

  if (messageError || !message) {
    return { error: "Message not found or inaccessible." };
  }
  if (
    message.direction !== "outbound" ||
    message.status !== "failed" ||
    message.type !== "text"
  ) {
    return { error: "This message can't be retried." };
  }
  if (message.sent_by !== user.id) {
    return { error: "Only the original sender can retry this message." };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, external_contact_id, lead_id")
    .eq("id", message.conversation_id)
    .single();
  if (!conversation) {
    return { error: "Conversation not found or inaccessible." };
  }

  await supabase
    .from("messages")
    .update({ status: "pending", error_message: null })
    .eq("id", messageId);

  const result = await deliverText(
    supabase,
    messageId,
    conversation.external_contact_id,
    message.text_body ?? "",
  );
  if (result.error) return { error: result.error };

  await touchConversation(supabase, conversation.id, message.text_body ?? "");
  if (conversation.lead_id) {
    await logWhatsappActivity(
      supabase,
      conversation.lead_id,
      `→ ${message.text_body ?? ""}`,
    );
  }
  revalidatePath("/inbox");
  return { success: true };
}

// Kirim lampiran (gambar/dokumen/audio/video) yang sudah diupload sales ke
// bucket "whatsapp-media". Meta mengunduh filenya dari signed URL sementara.
export async function sendMedia(
  conversationId: string,
  storagePath: string,
  type: OutboundMediaType,
  filename?: string,
  caption?: string,
): Promise<InboxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, external_contact_id, lead_id")
    .eq("id", conversationId)
    .single();
  if (conversationError || !conversation) {
    return { error: "Conversation not found or inaccessible." };
  }

  const trimmedCaption = caption?.trim() || null;
  const { data: insertedMessage, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      type,
      text_body: trimmedCaption,
      media_path: storagePath,
      media_filename: filename ?? null,
      media_status: "stored",
      status: "pending",
      sent_by: user.id,
      wa_timestamp: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !insertedMessage) {
    return { error: insertError?.message ?? "Failed to save message." };
  }

  // Signed URL berlaku 5 menit — cukup buat Meta mengunduhnya sekali.
  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from("whatsapp-media")
    .createSignedUrl(storagePath, 300);

  if (signError || !signed?.signedUrl) {
    await supabase
      .from("messages")
      .update({ status: "failed", error_message: "Couldn't prepare the file." })
      .eq("id", insertedMessage.id);
    return { error: "Couldn't prepare the file." };
  }

  const preview = trimmedCaption ?? filename ?? `[${type}]`;

  try {
    const { waMessageId } = await sendMediaMessage(
      conversation.external_contact_id,
      {
        type,
        link: signed.signedUrl,
        filename,
        caption: trimmedCaption ?? undefined,
      },
    );
    await supabase
      .from("messages")
      .update({ status: "sent", wa_message_id: waMessageId, error_message: null })
      .eq("id", insertedMessage.id);
  } catch (e) {
    const message =
      e instanceof WhatsappApiError ? e.message : "Failed to send file.";
    await supabase
      .from("messages")
      .update({ status: "failed", error_message: message })
      .eq("id", insertedMessage.id);
    return { error: message };
  }

  await touchConversation(supabase, conversationId, preview);
  if (conversation.lead_id) {
    await logWhatsappActivity(supabase, conversation.lead_id, `→ ${preview}`);
  }
  revalidatePath("/inbox");
  return { success: true };
}

const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;

// Jenis media keluar dari mime type file.
function mediaTypeFromMime(mime: string): OutboundMediaType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

// Terima file lampiran dari inbox, upload ke bucket "whatsapp-media" pakai
// service-role (bypass RLS), lalu kirim lewat sendMedia. Dipakai supaya
// browser tidak perlu izin tulis langsung ke Storage.
export async function sendMediaAttachment(
  conversationId: string,
  formData: FormData,
): Promise<InboxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file selected." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "File is too large (max 16 MB)." };
  }

  // Pastikan user memang berhak akses percakapan ini.
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .single();
  if (conversationError || !conversation) {
    return { error: "Conversation not found or inaccessible." };
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "file";
  const path = `outbound/${randomUUID()}-${safeName}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("whatsapp-media")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) return { error: uploadError.message };

  return sendMedia(
    conversationId,
    path,
    mediaTypeFromMime(file.type),
    file.name,
  );
}

// Tandai percakapan sudah dibaca: reset unread_count di CRM + kirim tanda
// "dibaca" (centang biru) ke WhatsApp untuk pesan masuk terakhir.
export async function markConversationRead(
  conversationId: string,
): Promise<InboxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: lastInbound } = await supabase
    .from("messages")
    .select("wa_message_id")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .not("wa_message_id", "is", null)
    .order("wa_timestamp", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (lastInbound?.wa_message_id) {
    try {
      await markMessageRead(lastInbound.wa_message_id);
    } catch {
      // Best-effort — kalau gagal, tanda "dibaca" cuma tidak terkirim.
    }
  }

  await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);

  revalidatePath("/inbox");
  return { success: true };
}

// Pindahkan percakapan ke sales lain, atau lepas ke pool kalau toProfileId
// null. Boleh dilakukan oleh admin, oleh sales yang saat ini memegang
// percakapan itu, atau kalau percakapan belum dipegang siapa-siapa.
//
// Update-nya lewat service-role client karena RLS update biasa (lihat 0008)
// menolak non-admin yang men-set assigned_to ke orang lain — pengecekan izin
// dilakukan manual di sini sebelum update.
export async function transferConversation(
  conversationId: string,
  toProfileId: string | null,
): Promise<InboxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, assigned_to")
    .eq("id", conversationId)
    .single();

  if (conversationError || !conversation) {
    return { error: "Conversation not found or inaccessible." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.is_admin ?? false;
  const isOwner = conversation.assigned_to === user.id;
  const isUnclaimed = conversation.assigned_to === null;
  if (!isAdmin && !isOwner && !isUnclaimed) {
    return {
      error: "Only an admin or the current owner can reassign this conversation.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ assigned_to: toProfileId })
    .eq("id", conversationId);

  if (error) return { error: error.message };
  revalidatePath("/inbox");
  return { success: true };
}

// Ubah status antrean percakapan (open / pending / resolved). Saat di-resolve
// dicatat siapa & kapan; saat dibuka lagi, catatan itu dihapus.
export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus,
): Promise<InboxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const patch =
    status === "resolved"
      ? { status, resolved_at: new Date().toISOString(), resolved_by: user.id }
      : { status, resolved_at: null, resolved_by: null };

  const { error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", conversationId);

  if (error) return { error: error.message };
  revalidatePath("/inbox");
  return { success: true };
}

// Tandai percakapan sebagai "ditangani" oleh sales/admin yang sedang login.
export async function claimConversation(
  conversationId: string,
): Promise<InboxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase
    .from("conversations")
    .update({ assigned_to: user.id })
    .eq("id", conversationId);

  if (error) return { error: error.message };
  revalidatePath("/inbox");
  return { success: true };
}

// Buat lead baru langsung dari sebuah percakapan WhatsApp yang belum
// terhubung ke lead manapun (kontak baru yang belum tercatat di CRM).
export async function createLeadFromConversation(
  conversationId: string,
  nama: string,
): Promise<InboxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, external_contact_id")
    .eq("id", conversationId)
    .single();

  if (conversationError || !conversation) {
    return { error: "Conversation not found or inaccessible." };
  }

  const { data: newLead, error: leadError } = await supabase
    .from("leads")
    .insert({
      nama: nama.trim() || conversation.external_contact_id,
      kontak: conversation.external_contact_id,
      sumber: "WhatsApp",
      assigned_to: user.id,
    })
    .select("id")
    .single();

  if (leadError || !newLead) {
    return { error: leadError?.message ?? "Failed to create lead." };
  }

  const { error } = await supabase
    .from("conversations")
    .update({ lead_id: newLead.id, assigned_to: user.id })
    .eq("id", conversationId);

  if (error) return { error: error.message };
  revalidatePath("/inbox");
  revalidatePath("/");
  return { success: true };
}

// Hubungkan percakapan WhatsApp ke lead yang sudah ada (dipilih lewat
// pencarian nama/kontak di InboxView).
export async function linkConversationToLead(
  conversationId: string,
  leadId: string,
): Promise<InboxActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, assigned_to")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) return { error: "Lead not found." };

  const { error } = await supabase
    .from("conversations")
    // Kalau lead sudah punya sales penanggung jawab, ikut sales itu;
    // kalau belum, jadikan yang link sekarang sebagai penanggung jawabnya.
    .update({ lead_id: lead.id, assigned_to: lead.assigned_to ?? user.id })
    .eq("id", conversationId);

  if (error) return { error: error.message };
  revalidatePath("/inbox");
  return { success: true };
}
