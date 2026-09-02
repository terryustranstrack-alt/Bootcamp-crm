import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTextMessage, WhatsappApiError } from "@/lib/whatsapp";
import { generateBotReply, type BotHistoryTurn } from "@/lib/anthropic";
import { logWhatsappActivity } from "@/lib/activity";
import type { BotConfig } from "@/lib/types";

type AdminClient = ReturnType<typeof createAdminClient>;

const DAY_MS = 24 * 60 * 60 * 1000;

type ConversationRow = {
  id: string;
  external_contact_id: string;
  assigned_to: string | null;
  status: string;
  lead_id: string | null;
};

type MessageRow = {
  direction: "inbound" | "outbound";
  type: string;
  text_body: string | null;
  sent_by_bot: boolean;
  wa_timestamp: string | null;
  created_at: string;
};

function messageTime(m: MessageRow): number {
  return new Date(m.wa_timestamp ?? m.created_at).getTime();
}

// Boleh balas otomatis kalau: bot menyala, belum dipegang manusia, belum
// resolved, jatah balasan belum habis, dan masih di jendela 24 jam.
function shouldBotReply(
  conversation: ConversationRow,
  config: BotConfig,
  botReplyCount: number,
  lastInboundAt: number | null,
): boolean {
  if (!config.enabled) return false;
  if (conversation.assigned_to) return false;
  if (conversation.status === "resolved") return false;
  if (botReplyCount >= config.max_replies_per_conversation) return false;
  if (lastInboundAt == null || Date.now() - lastInboundAt > DAY_MS) return false;
  return true;
}

// Ubah pesan-pesan terakhir jadi riwayat untuk model (inbound = user,
// outbound = assistant). Media/pesan tanpa teks diringkas.
function toHistory(messages: MessageRow[]): BotHistoryTurn[] {
  return messages.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content:
      m.text_body?.trim() ||
      (m.type === "text" ? "" : `[${m.type}]`) ||
      "[no text]",
  }));
}

// Coba jalankan chatbot untuk sebuah pesan masuk. Dipanggil lewat after() di
// webhook — jadi tidak menahan respons 200 ke Meta. Semua akses DB pakai
// service-role client (tidak ada sesi user di konteks webhook).
export async function maybeRunBot(
  admin: AdminClient,
  conversationId: string,
): Promise<void> {
  try {
    const { data: config } = await admin
      .from("bot_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (!config) return;
    const botConfig = config as BotConfig;
    if (!botConfig.enabled) return;

    const { data: conversation } = await admin
      .from("conversations")
      .select("id, external_contact_id, assigned_to, status, lead_id")
      .eq("id", conversationId)
      .single();
    if (!conversation) return;
    const conv = conversation as ConversationRow;

    const { data: recent } = await admin
      .from("messages")
      .select("direction, type, text_body, sent_by_bot, wa_timestamp, created_at")
      .eq("conversation_id", conversationId)
      .order("wa_timestamp", { ascending: true, nullsFirst: true })
      .limit(12);
    const messages = (recent ?? []) as MessageRow[];
    if (messages.length === 0) return;

    // Idempoten: kalau pesan terakhir sudah dari bot, berarti sudah dibalas.
    const last = messages[messages.length - 1];
    if (last.direction === "outbound") return;

    const botReplyCount = messages.filter(
      (m) => m.direction === "outbound" && m.sent_by_bot,
    ).length;
    const lastInbound = [...messages]
      .reverse()
      .find((m) => m.direction === "inbound");
    const lastInboundAt = lastInbound ? messageTime(lastInbound) : null;

    if (!shouldBotReply(conv, botConfig, botReplyCount, lastInboundAt)) return;

    const { text, handoff } = await generateBotReply({
      systemPrompt: botConfig.system_prompt,
      faq: botConfig.faq,
      history: toHistory(messages.slice(-10)),
    });
    if (handoff || !text) return;

    // Cek lagi tepat sebelum kirim — manusia mungkin sudah klaim saat API jalan.
    const { data: fresh } = await admin
      .from("conversations")
      .select("assigned_to, status")
      .eq("id", conversationId)
      .single();
    if (fresh?.assigned_to || fresh?.status === "resolved") return;

    const now = new Date().toISOString();
    let waMessageId: string | null = null;
    let status = "sent";
    let errorMessage: string | null = null;
    try {
      const result = await sendTextMessage(conv.external_contact_id, text);
      waMessageId = result.waMessageId;
    } catch (e) {
      status = "failed";
      errorMessage =
        e instanceof WhatsappApiError ? e.message : "Failed to send bot reply.";
    }

    await admin.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      type: "text",
      text_body: text,
      status,
      error_message: errorMessage,
      sent_by: null,
      sent_by_bot: true,
      wa_message_id: waMessageId,
      wa_timestamp: now,
    });

    if (status === "sent") {
      await admin
        .from("conversations")
        .update({
          last_message_at: now,
          last_message_preview: text.slice(0, 200),
        })
        .eq("id", conversationId);
      if (conv.lead_id) {
        await logWhatsappActivity(admin, conv.lead_id, `→ (bot) ${text}`);
      }
    }
  } catch {
    // Chatbot gagal tidak boleh mengganggu penerimaan pesan — telan errornya.
  }
}
