import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { sendTextMessage, WhatsappApiError } from "@/lib/whatsapp";
import { getBrandPhoneNumberId } from "@/lib/brands";
import {
  extractLeadFields,
  generateBotReply,
  type BotHistoryTurn,
} from "@/lib/groq";
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
  bot_replies_paused: boolean;
  brand_id: string | null;
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
// resolved, belum diserahkan ke sales, jatah balasan belum habis, dan masih
// di jendela 24 jam.
function shouldBotReply(
  conversation: ConversationRow,
  config: BotConfig,
  botReplyCount: number,
  lastInboundAt: number | null,
): boolean {
  if (!config.enabled) return false;
  if (conversation.assigned_to) return false;
  if (conversation.status === "resolved") return false;
  if (conversation.bot_replies_paused) return false;
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
    const { data: conversation } = await admin
      .from("conversations")
      .select(
        "id, external_contact_id, assigned_to, status, lead_id, bot_replies_paused, brand_id",
      )
      .eq("id", conversationId)
      .single();
    if (!conversation) return;
    const conv = conversation as ConversationRow;

    const { data: config } = await admin
      .from("bot_config")
      .select("*")
      .eq("brand_id", conv.brand_id)
      .single();
    if (!config) return;
    const botConfig = config as BotConfig;
    if (!botConfig.enabled) return;

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

    // Kontak pertama kali (belum pernah ada pesan keluar sama sekali): kirim
    // pesan pembuka apa adanya — biasanya untuk menyapa & menanyakan data
    // calon pelanggan sekaligus. Tidak lewat AI, jadi selalu sama & lengkap.
    const hasOutbound = messages.some((m) => m.direction === "outbound");
    const welcome = botConfig.welcome_message.trim();
    if (!hasOutbound && welcome) {
      if (await botMustStayQuiet(admin, conversationId)) return;
      await deliverBotText(admin, conv, conversationId, welcome);
      return;
    }

    const { text, handoff } = await generateBotReply({
      systemPrompt: botConfig.system_prompt,
      faq: botConfig.faq,
      history: toHistory(messages.slice(-10)),
    });
    if (handoff || !text) return;

    // Cek lagi tepat sebelum kirim — situasinya mungkin berubah saat API jalan
    // (manusia klaim, atau enrichment menyerahkan lead ke sales).
    if (await botMustStayQuiet(admin, conversationId)) return;
    await deliverBotText(admin, conv, conversationId, text);
  } catch {
    // Chatbot gagal tidak boleh mengganggu penerimaan pesan — telan errornya.
  }
}

// Apakah bot harus diam sekarang — diambil alih manusia (diklaim/di-resolve)
// atau sudah diserahkan ke sales. Dipanggil tepat sebelum bot mengirim,
// karena keadaan bisa berubah selama panggilan AI berjalan.
async function botMustStayQuiet(
  admin: AdminClient,
  conversationId: string,
): Promise<boolean> {
  const { data: fresh } = await admin
    .from("conversations")
    .select("assigned_to, status, bot_replies_paused")
    .eq("id", conversationId)
    .single();
  return (
    Boolean(fresh?.assigned_to) ||
    fresh?.status === "resolved" ||
    Boolean(fresh?.bot_replies_paused)
  );
}

// Kirim satu pesan teks dari bot ke kontak, simpan barisnya (sent_by_bot),
// lalu perbarui ringkasan percakapan & riwayat aktivitas lead kalau ada.
async function deliverBotText(
  admin: AdminClient,
  conv: ConversationRow,
  conversationId: string,
  text: string,
): Promise<void> {
  const now = new Date().toISOString();
  let waMessageId: string | null = null;
  let status = "sent";
  let errorMessage: string | null = null;
  try {
    const phoneNumberId = await getBrandPhoneNumberId(admin, conv.brand_id);
    const result = await sendTextMessage(conv.external_contact_id, text, phoneNumberId);
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
      await advanceLeadOnFirstContact(admin, conv.lead_id);
    }
  }
}

// Begitu bot mengirim pesan ke sebuah lead, lead itu sudah "dihubungi".
// Naikkan statusnya dari "Baru" → "Dihubungi" (sekali saja) supaya pipeline
// mencerminkan keadaan sebenarnya, dan catat perubahannya.
async function advanceLeadOnFirstContact(
  admin: AdminClient,
  leadId: string,
): Promise<void> {
  const { data: lead } = await admin
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .single();
  if (lead?.status !== "Baru") return;

  await admin
    .from("leads")
    .update({ status: "Dihubungi", tanggal_update: new Date().toISOString() })
    .eq("id", leadId);
  await admin.from("lead_activities").insert({
    lead_id: leadId,
    type: "status_change",
    old_status: "Baru",
    new_status: "Dihubungi",
    created_by: null,
  });
}

// ── Auto-capture data lead dari isi chat ──────────────────────────────────

type LeadRow = {
  id: string;
  nama: string;
  kontak: string;
  perusahaan: string | null;
  jabatan: string | null;
  kota: string | null;
  email: string | null;
  catatan: string;
};

// Cek email sekilas (ada "@" dan "." setelahnya) — bukan validasi ketat,
// cuma supaya teks acak tidak masuk ke kolom email.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Anggap field lead masih "kosong" kalau null / string kosong.
function isBlank(value: string | null): boolean {
  return !value || value.trim() === "";
}

// Bangun patch hanya untuk field lead yang MASIH kosong dan datanya ada di
// hasil ekstraksi. Tidak pernah menimpa data yang sudah diisi manusia.
function buildLeadPatch(
  lead: LeadRow,
  info: {
    nama: string;
    email: string;
    perusahaan: string;
    jabatan: string;
    kota: string;
    kebutuhan: string;
  },
): { patch: Record<string, string>; filledLabels: string[] } {
  const patch: Record<string, string> = {};
  const filledLabels: string[] = [];

  // Nama: isi kalau lead belum punya nama beneran (masih kosong atau masih
  // sama dengan nomor teleponnya sebagai placeholder).
  if (
    info.nama &&
    (isBlank(lead.nama) || lead.nama === lead.kontak) &&
    info.nama !== lead.kontak
  ) {
    patch.nama = info.nama;
    filledLabels.push("name");
  }
  if (info.email && looksLikeEmail(info.email) && isBlank(lead.email)) {
    patch.email = info.email;
    filledLabels.push("email");
  }
  if (info.perusahaan && isBlank(lead.perusahaan)) {
    patch.perusahaan = info.perusahaan;
    filledLabels.push("company");
  }
  if (info.jabatan && isBlank(lead.jabatan)) {
    patch.jabatan = info.jabatan;
    filledLabels.push("job title");
  }
  if (info.kota && isBlank(lead.kota)) {
    patch.kota = info.kota;
    filledLabels.push("city");
  }
  if (info.kebutuhan && isBlank(lead.catatan)) {
    patch.catatan = info.kebutuhan;
    filledLabels.push("notes");
  }

  return { patch, filledLabels };
}

// Catat satu baris "note" di riwayat aktivitas lead (dipakai untuk mencatat
// apa saja yang diisi otomatis oleh bot). Pakai client service-role.
async function logBotNote(
  admin: AdminClient,
  leadId: string,
  content: string,
): Promise<void> {
  await admin.from("lead_activities").insert({
    lead_id: leadId,
    type: "note",
    content,
    created_by: null,
  });
}

// Baca percakapan, tarik data calon pelanggan yang disebutkan pelanggan
// sendiri, lalu:
//  - kalau percakapan belum punya lead → buat lead baru (sumber "WhatsApp"),
//  - kalau sudah punya → isi field yang masih kosong saja.
// Setiap perubahan dicatat ke riwayat aktivitas lead supaya sales bisa
// mengoreksi. Dipanggil lewat after() dari webhook. "Best effort" — semua
// error ditelan, tidak boleh mengganggu penerimaan pesan.
export async function maybeEnrichLead(
  admin: AdminClient,
  conversationId: string,
): Promise<void> {
  try {
    const { data: conversation } = await admin
      .from("conversations")
      .select(
        "id, external_contact_id, display_name, lead_id, assigned_to, bot_replies_paused, enrich_attempts, brand_id",
      )
      .eq("id", conversationId)
      .single();
    if (!conversation) return;
    const conv = conversation as {
      id: string;
      external_contact_id: string;
      display_name: string | null;
      lead_id: string | null;
      assigned_to: string | null;
      bot_replies_paused: boolean;
      enrich_attempts: number;
      brand_id: string | null;
    };
    // Sudah diserahkan ke sales → berhenti menarik data juga, biar manusia
    // yang pegang.
    if (conv.bot_replies_paused) return;
    // Batas atas: jangan panggil AI tanpa henti untuk satu percakapan.
    if (conv.enrich_attempts >= 8) return;

    const { data: config } = await admin
      .from("bot_config")
      .select("enabled")
      .eq("brand_id", conv.brand_id)
      .single();
    // Ikut saklar chatbot yang sama — kalau bot mati, tidak auto-isi lead.
    if (!config?.enabled) return;

    const { data: recent } = await admin
      .from("messages")
      .select("direction, type, text_body, sent_by_bot, wa_timestamp, created_at")
      .eq("conversation_id", conversationId)
      .order("wa_timestamp", { ascending: true, nullsFirst: true })
      .limit(20);
    const messages = (recent ?? []) as MessageRow[];
    if (messages.length === 0) return;

    // Harus ada pesan MASUK dari pelanggan untuk diekstrak. Sengaja TIDAK
    // menuntut pesan terakhir = masuk: fungsi ini jalan paralel dengan
    // maybeRunBot, jadi balasan bot bisa keluar lebih dulu — yang penting
    // pelanggan pernah mengirim teks di percakapan ini.
    const inboundText = messages
      .filter((m) => m.direction === "inbound")
      .map((m) => m.text_body?.trim() ?? "")
      .join(" ")
      .trim();
    if (inboundText.length === 0) return;

    // Lewati selama pelanggan baru kirim sapaan/balasan singkat ("ok", "iya",
    // "halo") — belum ada data yang bisa ditarik, hemat panggilan AI.
    if (inboundText.length < 15 && !inboundText.includes("@")) return;

    let lead: LeadRow | null = null;
    if (conv.lead_id) {
      const { data } = await admin
        .from("leads")
        .select("id, nama, kontak, perusahaan, jabatan, kota, email, catatan")
        .eq("id", conv.lead_id)
        .single();
      lead = (data as LeadRow) ?? null;
      // Semua field target sudah terisi → tidak ada yang perlu diekstrak.
      if (
        lead &&
        !isBlank(lead.perusahaan) &&
        !isBlank(lead.jabatan) &&
        !isBlank(lead.kota) &&
        !isBlank(lead.email) &&
        !isBlank(lead.catatan) &&
        lead.nama !== lead.kontak
      ) {
        return;
      }
    }

    // Hitung percobaan ini dulu (juga kalau nanti gagal) supaya batas atas
    // benar-benar mengikat.
    await admin
      .from("conversations")
      .update({ enrich_attempts: conv.enrich_attempts + 1 })
      .eq("id", conversationId);

    const info = await extractLeadFields(toHistory(messages));
    const gotSomething =
      info.nama ||
      info.email ||
      info.perusahaan ||
      info.jabatan ||
      info.kota ||
      info.kebutuhan;
    if (!gotSomething && lead) return;

    // ── Percakapan sudah punya lead: isi field kosong saja ──
    if (lead) {
      const { patch, filledLabels } = buildLeadPatch(lead, info);
      if (filledLabels.length > 0) {
        await admin
          .from("leads")
          .update({ ...patch, tanggal_update: new Date().toISOString() })
          .eq("id", lead.id);
        await logBotNote(
          admin,
          lead.id,
          `Bot filled from chat: ${filledLabels.join(", ")}.`,
        );
      }
      // Cek apakah lead sudah "matang" (nama + kebutuhan + perusahaan/email)
      // — kalau ya, serahkan ke sales.
      const merged = { ...lead, ...patch } as LeadRow;
      if (leadIsQualified(merged)) {
        await handOffToSales(admin, conv, conversationId, lead.id);
      }
      return;
    }

    // ── Percakapan belum punya lead ──
    // Aman dulu: cocokkan nomor ke lead brand yang sama yang sudah ada
    // (format kontak bebas, jadi disamakan dulu sebelum dibandingkan — sama
    // seperti di webhook). Dibatasi ke brand ini supaya lead tim sales
    // brand lain tidak ikut ke-link.
    const normalized = normalizePhone(conv.external_contact_id);
    const { data: allLeads } = await admin
      .from("leads")
      .select("id, kontak")
      .eq("brand_id", conv.brand_id);
    const matched = (allLeads ?? []).find(
      (l) => normalizePhone(l.kontak) === normalized,
    );

    if (matched) {
      await admin
        .from("conversations")
        .update({ lead_id: matched.id })
        .eq("id", conversationId);
      return;
    }

    // Benar-benar kontak baru → buat lead baru.
    const nama =
      info.nama && info.nama !== conv.external_contact_id
        ? info.nama
        : conv.display_name?.trim() || conv.external_contact_id;
    const newLead = {
      nama,
      kontak: conv.external_contact_id,
      sumber: "WhatsApp",
      assigned_to: conv.assigned_to,
      brand_id: conv.brand_id,
      perusahaan: info.perusahaan || null,
      jabatan: info.jabatan || null,
      kota: info.kota || null,
      email: info.email && looksLikeEmail(info.email) ? info.email : null,
      catatan: info.kebutuhan || "",
      created_by_bot: true,
    };
    const { data: created } = await admin
      .from("leads")
      .insert(newLead)
      .select("id")
      .single();
    if (!created) return;

    await admin
      .from("conversations")
      .update({ lead_id: created.id })
      .eq("id", conversationId);
    await logBotNote(
      admin,
      created.id,
      "Lead auto-created by bot from a WhatsApp chat.",
    );

    if (
      leadIsQualified({
        nama: newLead.nama,
        kontak: newLead.kontak,
        perusahaan: newLead.perusahaan,
        email: newLead.email,
        catatan: newLead.catatan,
      })
    ) {
      await handOffToSales(admin, conv, conversationId, created.id);
    }
  } catch {
    // Best effort — jangan sampai mengganggu penerimaan pesan.
  }
}

// Sebuah lead dianggap "matang" untuk sales kalau minimal punya: nama asli
// (bukan sekadar nomor telepon), kebutuhan yang disebutkan, dan salah satu
// dari nama perusahaan atau email.
function leadIsQualified(l: {
  nama: string;
  kontak: string;
  perusahaan: string | null;
  email: string | null;
  catatan: string | null;
}): boolean {
  const hasName = Boolean(l.nama) && l.nama !== l.kontak;
  const hasNeed = !isBlank(l.catatan);
  const hasContext = !isBlank(l.perusahaan) || !isBlank(l.email);
  return hasName && hasNeed && hasContext;
}

// Pesan penutup dari bot sebelum menyerahkan ke tim sales.
const HANDOFF_MESSAGE =
  "Terima kasih! Data Anda sudah kami terima. Tim sales TransTRACK akan " +
  "segera menghubungi Anda pada jam kerja (Senin–Jumat, 09.00–17.00 WIB).";

// Bot sudah mengumpulkan lead yang matang: hentikan balasan otomatis, kirim
// pesan penutup, dan tandai percakapan supaya muncul di tab "Needs follow-up"
// buat tim sales.
async function handOffToSales(
  admin: AdminClient,
  conv: {
    external_contact_id: string;
    assigned_to: string | null;
    brand_id: string | null;
  },
  conversationId: string,
  leadId: string,
): Promise<void> {
  await admin
    .from("conversations")
    .update({ bot_replies_paused: true })
    .eq("id", conversationId);

  const convRow: ConversationRow = {
    id: conversationId,
    external_contact_id: conv.external_contact_id,
    assigned_to: conv.assigned_to,
    status: "open",
    lead_id: leadId,
    bot_replies_paused: true,
    brand_id: conv.brand_id,
  };
  await deliverBotText(admin, convRow, conversationId, HANDOFF_MESSAGE);
  await logBotNote(
    admin,
    leadId,
    "Bot collected a qualified lead and handed off for sales follow-up.",
  );
}
