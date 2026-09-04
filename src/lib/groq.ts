import "server-only";

// Model chatbot. GPT-OSS 120B lewat Groq: masuk paket gratis (±1.000
// balasan/hari), cepat, lancar Bahasa Indonesia, dan cukup pintar untuk
// menjawab FAQ + menyapa lead baru. Groq tidak memakai data percakapan
// untuk melatih model.
const BOT_MODEL = "openai/gpt-oss-120b";

// Sentinel yang boleh dikeluarkan model kalau butuh diserahkan ke manusia.
const HANDOFF_MARKER = "[[HANDOFF]]";

export class GroqApiError extends Error {}

export type BotHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Panggil Groq (endpoint chat, kompatibel OpenAI) sekali dan kembalikan isi
// teks balasannya. Semua pemanggil di file ini lewat sini supaya penanganan
// error & header-nya cuma ditulis sekali.
async function callGroq(body: Record<string, unknown>): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqApiError("GROQ_API_KEY belum diisi.");
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: BOT_MODEL, ...body }),
  });

  const data = await res.json();
  if (!res.ok) {
    const message =
      data?.error?.message ?? `Groq API error (HTTP ${res.status}).`;
    throw new GroqApiError(message);
  }
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

// Susun instruksi sistem: peran + FAQ + aturan handoff.
function buildSystemPrompt(systemPrompt: string, faq: string): string {
  return [
    systemPrompt.trim(),
    faq.trim()
      ? `\n\nFAQ / reference information you may use to answer:\n${faq.trim()}`
      : "",
    `\n\nRules:
- Reply in the same language the customer uses.
- Keep replies short and friendly (2-4 sentences).
- Only answer using the information you are given. If you do not know, or the
  customer wants pricing/a human/a complaint/anything sensitive, output exactly
  "${HANDOFF_MARKER}" and nothing else.
- Never invent prices, dates, or promises.`,
  ].join("");
}

/**
 * Minta balasan dari model untuk sebuah percakapan WhatsApp. Kembalikan
 * `{ text, handoff }` — kalau `handoff` true, jangan kirim apa-apa ke kontak,
 * biarkan ditangani manusia.
 */
export async function generateBotReply({
  systemPrompt,
  faq,
  history,
}: {
  systemPrompt: string;
  faq: string;
  history: BotHistoryTurn[];
}): Promise<{ text: string; handoff: boolean }> {
  // Groq memakai format yang sama dengan OpenAI: instruksi sistem jadi pesan
  // pertama dengan role "system", lalu menyusul riwayat percakapan.
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(systemPrompt, faq) },
    ...history,
  ];

  const text = await callGroq({
    max_completion_tokens: 512,
    temperature: 0.3,
    // Model ini bisa "berpikir" dulu; untuk balasan FAQ singkat, pikiran
    // seperlunya saja supaya cepat & hemat. Isi pikiran ditaruh di field
    // terpisah oleh Groq, jadi tidak ikut ke balasan pelanggan.
    reasoning_effort: "low",
    messages,
  });

  if (!text || text.includes(HANDOFF_MARKER)) {
    return { text: "", handoff: true };
  }
  return { text, handoff: false };
}

// Data calon pelanggan yang bisa dikenali dari isi chat. String kosong =
// tidak disebutkan pelanggan.
export type ExtractedLeadFields = {
  nama: string;
  email: string;
  perusahaan: string;
  jabatan: string;
  kota: string;
  kebutuhan: string; // ringkasan singkat kebutuhan/produk yang diminati
};

const EMPTY_EXTRACTION: ExtractedLeadFields = {
  nama: "",
  email: "",
  perusahaan: "",
  jabatan: "",
  kota: "",
  kebutuhan: "",
};

/**
 * Baca seluruh percakapan dan tarik data calon pelanggan yang DISEBUTKAN
 * sendiri oleh pelanggan (nama, email, perusahaan, jabatan, kota, kebutuhan).
 * Model diminta mengembalikan JSON; field yang tidak disebutkan dikembalikan
 * sebagai string kosong. Kalau apa pun gagal, kembalikan semua kosong —
 * fitur ini "best effort", tidak boleh bikin error.
 */
export async function extractLeadFields(
  history: BotHistoryTurn[],
): Promise<ExtractedLeadFields> {
  const transcript = history
    .map((t) => `${t.role === "user" ? "Customer" : "Us"}: ${t.content}`)
    .join("\n");

  try {
    const raw = await callGroq({
      max_completion_tokens: 400,
      temperature: 0,
      reasoning_effort: "low",
      // Minta output JSON murni supaya gampang diparse.
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You extract customer contact details from a WhatsApp chat.
Return ONLY a JSON object with these string keys: nama, email, perusahaan,
jabatan, kota, kebutuhan.
- Fill a field only if the CUSTOMER stated it themselves in the chat.
- "nama" = the person's name. "perusahaan" = their company. "jabatan" = their
  job title. "kota" = their city/region. "kebutuhan" = a short phrase (max 15
  words) describing what they need or are interested in.
- If a field was not mentioned, use an empty string "".
- Never guess, translate, or invent. Copy values as the customer wrote them.`,
        },
        { role: "user", content: transcript },
      ],
    });

    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return {
      nama: str(parsed.nama),
      email: str(parsed.email),
      perusahaan: str(parsed.perusahaan),
      jabatan: str(parsed.jabatan),
      kota: str(parsed.kota),
      kebutuhan: str(parsed.kebutuhan),
    };
  } catch {
    return { ...EMPTY_EXTRACTION };
  }
}
