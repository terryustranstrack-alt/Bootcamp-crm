import "server-only";

// Model chatbot. Llama 3.3 70B lewat Groq: gratis, cepat, dan cukup pintar
// untuk menjawab FAQ + menyapa lead baru. Groq tidak memakai data percakapan
// untuk melatih model mereka.
const BOT_MODEL = "llama-3.3-70b-versatile";

// Sentinel yang boleh dikeluarkan model kalau butuh diserahkan ke manusia.
const HANDOFF_MARKER = "[[HANDOFF]]";

export class GroqApiError extends Error {}

export type BotHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

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
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqApiError("GROQ_API_KEY belum diisi.");
  }

  // Groq memakai format yang sama dengan OpenAI: instruksi sistem jadi pesan
  // pertama dengan role "system", lalu menyusul riwayat percakapan.
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(systemPrompt, faq) },
    ...history,
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: BOT_MODEL,
      max_completion_tokens: 512,
      temperature: 0.3,
      messages,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const message =
      data?.error?.message ?? `Groq API error (HTTP ${res.status}).`;
    throw new GroqApiError(message);
  }

  const text: string = (data?.choices?.[0]?.message?.content ?? "").trim();

  if (!text || text.includes(HANDOFF_MARKER)) {
    return { text: "", handoff: true };
  }
  return { text, handoff: false };
}
