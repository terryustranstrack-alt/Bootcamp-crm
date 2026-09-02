"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QuickReply } from "@/lib/types";

const supabase = createClient();

// Daftar quick reply yang boleh dilihat user (milik bersama + miliknya),
// difilter oleh RLS. `reload()` untuk memuat ulang setelah CRUD di Settings.
export function useQuickReplies() {
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const { data } = await supabase
      .from("quick_replies")
      .select("*")
      .order("title", { ascending: true });
    if (data) setQuickReplies(data as QuickReply[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  return { quickReplies, loading, reload };
}
