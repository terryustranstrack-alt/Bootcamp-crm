"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const supabase = createClient();

// Ambil baris `profiles` milik user yang sedang login (termasuk apakah dia
// admin atau bukan) — dipakai di banyak tempat untuk menentukan hak akses,
// mis. hanya admin yang boleh ganti assignee lead.
export function useCurrentProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile((data as Profile) ?? null);
      setLoading(false);
    }
    load();
  }, []);

  return { profile, loading };
}
