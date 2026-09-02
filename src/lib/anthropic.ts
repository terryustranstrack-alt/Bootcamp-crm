import "server-only";

// Model chatbot. Haiku dipilih karena murah & cepat, cukup untuk FAQ + sapaan.
const BOT_MODEL = "claude-haiku-4-5";

// Sentinel yang boleh dikeluarkan model kalau butuh diserahkan ke manusia.
const HANDOFF_MARKER = "[[HANDOFF]]";

export class AnthropicApiError extends Error {}

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
 * Minta balasan dari Claude untuk sebuah percakapan WhatsApp. Kembalikan
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnthropicApiError("ANTHROPIC_API_KEY belum diisi.");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: BOT_MODEL,
      max_tokens: 512,
      system: buildSystemPrompt(systemPrompt, faq),
      messages: history,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const message =
      data?.error?.message ?? `Anthropic API error (HTTP ${res.status}).`;
    throw new AnthropicApiError(message);
  }

  const text: string = (data?.content ?? [])
    .filter((block: { type?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text ?? "")
    .join("")
    .trim();

  if (!text || text.includes(HANDOFF_MARKER)) {
    return { text: "", handoff: true };
  }
  return { text, handoff: false };
}
