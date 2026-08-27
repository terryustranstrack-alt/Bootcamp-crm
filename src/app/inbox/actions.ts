"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendTextMessage, WhatsappApiError } from "@/lib/whatsapp";

export type InboxActionState = { error?: string; success?: boolean } | undefined;

// Kirim balasan WhatsApp dari CRM: simpan pesan sebagai "pending" dulu,
// baru kirim beneran lewat WhatsApp Cloud API, lalu update status pesan
// jadi "sent" atau "failed" sesuai hasilnya.
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
    .select("id, external_contact_id")
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
    })
    .select("id")
    .single();

  if (insertError || !insertedMessage) {
    return { error: insertError?.message ?? "Failed to save message." };
  }

  try {
    const { waMessageId } = await sendTextMessage(
      conversation.external_contact_id,
      trimmedText,
    );
    await supabase
      .from("messages")
      .update({ status: "sent", wa_message_id: waMessageId })
      .eq("id", insertedMessage.id);
  } catch (e) {
    // Gagal kirim (mis. sudah lewat 24 jam sejak pesan terakhir kontak,
    // atau kredensial API salah) — tandai pesan gagal, jangan biarkan
    // tersangkut selamanya di status "pending".
    const message = e instanceof WhatsappApiError ? e.message : "Failed to send message.";
    await supabase
      .from("messages")
      .update({ status: "failed", error_message: message })
      .eq("id", insertedMessage.id);
    return { error: message };
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: trimmedText.slice(0, 200),
      unread_count: 0,
    })
    .eq("id", conversationId);

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
