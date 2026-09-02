"use client";

import { createClient } from "@/lib/supabase/client";
import type { MessageDirection } from "@/lib/types";

const supabase = createClient();

export type MessageSearchHit = {
  messageId: string;
  conversationId: string;
  snippet: string;
  waTimestamp: string | null;
  direction: MessageDirection;
};

// Cari pesan yang isinya mengandung `query` (tidak peduli huruf besar/kecil),
// maksimal 30 hasil terbaru. RLS membatasi hasil ke pesan dari percakapan
// yang boleh dilihat user yang login.
export async function searchMessages(
  query: string,
): Promise<MessageSearchHit[]> {
  const keyword = query.trim();
  if (keyword.length < 2) return [];

  // Escape karakter wildcard supaya "%" / "_" dicari apa adanya.
  const escaped = keyword.replace(/[%_\\]/g, "\\$&");
  const { data } = await supabase
    .from("messages")
    .select("id, conversation_id, text_body, wa_timestamp, direction")
    .ilike("text_body", `%${escaped}%`)
    .order("wa_timestamp", { ascending: false, nullsFirst: false })
    .limit(30);

  if (!data) return [];
  return data.map((m) => ({
    messageId: m.id,
    conversationId: m.conversation_id,
    snippet: (m.text_body ?? "").slice(0, 120),
    waTimestamp: m.wa_timestamp,
    direction: m.direction as MessageDirection,
  }));
}
