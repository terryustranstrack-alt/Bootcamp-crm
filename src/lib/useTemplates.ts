"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WhatsappTemplateRow } from "@/lib/types";

const supabase = createClient();

// Daftar template WhatsApp. `approvedOnly` untuk picker di composer (cuma yang
// bisa dikirim); false untuk halaman Settings (tampilkan semua status).
export function useTemplates(approvedOnly = false) {
  const [templates, setTemplates] = useState<WhatsappTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    let query = supabase
      .from("whatsapp_templates")
      .select("*")
      .order("name", { ascending: true });
    if (approvedOnly) query = query.eq("status", "APPROVED");
    const { data } = await query;
    if (data) setTemplates(data as WhatsappTemplateRow[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedOnly]);

  return { templates, loading, reload };
}
