"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Message } from "@/lib/types";

const supabase = createClient();

// Daftar semua percakapan untuk sidebar inbox, terurut dari yang paling
// baru ada pesan. Pesan masuk lewat webhook (server-to-server), jadi tidak
// ada mutation di sisi client untuk trigger refetch seperti fitur lain di
// app ini — pakai Supabase Realtime supaya inbox tetap live.
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  async function load() {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (data) setConversations(data as Conversation[]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    const channel = supabase
      .channel("conversations-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return conversations;
}

// Daftar pesan (bolak-balik) untuk satu percakapan yang sedang dibuka di
// inbox, otomatis update lewat Supabase Realtime saat ada pesan baru
// masuk/keluar atau status pesan berubah (terkirim/dibaca/gagal).
export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);

  async function load(id: string) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      // Urut pakai wa_timestamp (waktu asli WhatsApp) supaya pesan yang
      // webhook-nya telat tetap muncul di posisi yang benar; created_at
      // sebagai tie-breaker.
      .order("wa_timestamp", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
  }

  useEffect(() => {
    if (!conversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      return;
    }

    load(conversationId);

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => load(conversationId),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return messages;
}
