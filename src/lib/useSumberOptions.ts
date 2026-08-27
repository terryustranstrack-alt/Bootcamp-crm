"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_SUMBER = [
  "Instagram Ads",
  "Facebook Ads",
  "Referral",
  "Organic",
  "Website",
  "WhatsApp",
];

const supabase = createClient();

// Daftar pilihan "Sumber" (asal lead) untuk dropdown SumberSelect: gabungan
// dari daftar default di atas + nilai-nilai unik yang sudah pernah dipakai
// di tabel leads (mis. hasil import CSV atau input custom "Lainnya").
export function useSumberOptions() {
  const [options, setOptions] = useState<string[]>(DEFAULT_SUMBER);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("leads").select("sumber");
      if (!data) return;

      const sumberYangSudahDipakai = data
        .map((row) => row.sumber)
        .filter((sumber): sumber is string => !!sumber);
      const merged = Array.from(
        new Set([...DEFAULT_SUMBER, ...sumberYangSudahDipakai]),
      ).sort();
      setOptions(merged);
    }
    load();
  }, []);

  return options;
}
