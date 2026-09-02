"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import type { Conversation } from "@/lib/types";

const supabase = createClient();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Irisan kecil dari tabel messages — cuma kolom yang dibutuhkan buat hitung
// metrik, dibatasi 30 hari terakhir supaya query tidak berat.
type MessageSlice = {
  conversation_id: string;
  direction: "inbound" | "outbound";
  wa_timestamp: string | null;
  created_at: string;
};

function messageTime(m: MessageSlice): number {
  return new Date(m.wa_timestamp ?? m.created_at).getTime();
}

// Format durasi rata-rata balasan jadi teks pendek (detik / menit / jam).
function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

// Blok metrik WhatsApp Inbox di halaman Dashboard: percakapan terbuka,
// yang menunggu dibalas, rata-rata waktu balasan pertama, dan sebaran
// beban per sales. Semua dihitung di sisi klien (pola sama seperti Dashboard).
export default function ChatMetrics() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<MessageSlice[]>([]);
  const [loading, setLoading] = useState(true);
  const profiles = useProfiles();

  useEffect(() => {
    async function load() {
      const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
      const [conversationsResult, messagesResult] = await Promise.all([
        supabase.from("conversations").select("*"),
        supabase
          .from("messages")
          .select("conversation_id, direction, wa_timestamp, created_at")
          .gte("wa_timestamp", since)
          .order("wa_timestamp", { ascending: true }),
      ]);
      if (conversationsResult.data) {
        setConversations(conversationsResult.data as Conversation[]);
      }
      if (messagesResult.data) {
        setMessages(messagesResult.data as MessageSlice[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const openConversations = conversations.filter(
      (c) => c.status !== "resolved",
    );

    // Kelompokkan pesan per percakapan (sudah terurut naik dari query).
    const messagesByConversation = new Map<string, MessageSlice[]>();
    for (const msg of messages) {
      const list = messagesByConversation.get(msg.conversation_id) ?? [];
      list.push(msg);
      messagesByConversation.set(msg.conversation_id, list);
    }

    // "Menunggu dibalas" = percakapan terbuka yang pesan terakhirnya dari kontak.
    let unanswered = 0;
    for (const c of openConversations) {
      const msgs = messagesByConversation.get(c.id);
      if (msgs && msgs.length > 0 && msgs[msgs.length - 1].direction === "inbound") {
        unanswered += 1;
      }
    }

    // Waktu balasan pertama: dari pesan masuk pertama ke pesan keluar pertama
    // sesudahnya, dirata-ratakan.
    const replyDeltas: number[] = [];
    for (const msgs of messagesByConversation.values()) {
      const firstInbound = msgs.find((m) => m.direction === "inbound");
      if (!firstInbound) continue;
      const inboundAt = messageTime(firstInbound);
      const firstReply = msgs.find(
        (m) => m.direction === "outbound" && messageTime(m) > inboundAt,
      );
      if (firstReply) replyDeltas.push(messageTime(firstReply) - inboundAt);
    }
    const avgReplyMs =
      replyDeltas.length > 0
        ? replyDeltas.reduce((a, b) => a + b, 0) / replyDeltas.length
        : null;

    // Percakapan terbuka per sales (+ baris "Unclaimed").
    const perSales = profiles.map((p) => ({
      name: profileLabel(p),
      count: openConversations.filter((c) => c.assigned_to === p.id).length,
    }));
    perSales.push({
      name: "Unclaimed",
      count: openConversations.filter((c) => !c.assigned_to).length,
    });

    return {
      openCount: openConversations.length,
      unanswered,
      avgReplyMs,
      perSales: perSales.filter((s) => s.count > 0),
    };
  }, [conversations, messages, profiles]);

  if (loading) {
    return (
      <section className="px-8 pb-8 max-w-3xl">
        <p className="text-sm text-gray-500">Loading chat metrics…</p>
      </section>
    );
  }

  const maxCount = Math.max(1, ...stats.perSales.map((s) => s.count));

  return (
    <section className="px-8 pb-8 flex flex-col gap-4 max-w-3xl">
      <h2 className="font-medium">WhatsApp Inbox</h2>

      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <p className="text-xs text-gray-500">Open conversations</p>
          <p className="text-2xl font-semibold">{stats.openCount}</p>
        </div>
        <div className="border rounded p-4">
          <p className="text-xs text-gray-500">Awaiting a reply</p>
          <p className="text-2xl font-semibold">{stats.unanswered}</p>
        </div>
        <div className="border rounded p-4">
          <p className="text-xs text-gray-500">Avg. first reply</p>
          <p className="text-2xl font-semibold">
            {formatDuration(stats.avgReplyMs)}
          </p>
        </div>
      </div>

      {stats.perSales.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            Open conversations by person
          </p>
          <div className="flex flex-col gap-2">
            {stats.perSales.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-sm">
                <span className="w-32 shrink-0 truncate">{s.name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded">
                  <div
                    className="h-2 bg-black rounded"
                    style={{ width: `${(s.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
