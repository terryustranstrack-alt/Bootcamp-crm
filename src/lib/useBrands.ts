"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Brand } from "@/lib/types";

const supabase = createClient();

// Ambil semua brand (nomor WhatsApp), brand default duluan — dipakai untuk
// dropdown pemilih brand (Inbox/Dashboard/Prospek/Settings/Sales Team).
export function useBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("brands")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      if (data) setBrands(data as Brand[]);
    }
    load();
  }, []);

  return brands;
}
