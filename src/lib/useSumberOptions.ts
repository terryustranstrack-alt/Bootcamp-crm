"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_SUMBER = [
  "Instagram Ads",
  "Facebook Ads",
  "Referral",
  "Organik",
  "Website",
  "WhatsApp",
];

const supabase = createClient();

export function useSumberOptions() {
  const [options, setOptions] = useState<string[]>(DEFAULT_SUMBER);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("leads").select("sumber");
      if (!data) return;

      const existing = data
        .map((row) => row.sumber)
        .filter((s): s is string => !!s);
      const merged = Array.from(new Set([...DEFAULT_SUMBER, ...existing])).sort();
      setOptions(merged);
    }
    load();
  }, []);

  return options;
}
