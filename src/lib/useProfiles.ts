"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const supabase = createClient();

// Ambil semua akun (sales + admin), diurutkan berdasarkan nama — dipakai
// untuk mengisi dropdown "Assigned to" (AssigneeSelect) dan halaman Sales
// Team.
export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name", { ascending: true });
      if (data) setProfiles(data as Profile[]);
    }
    load();
  }, []);

  return profiles;
}

// Nama yang ditampilkan untuk satu profil: pakai nama lengkap kalau ada,
// kalau tidak fallback ke email, kalau tidak ada juga fallback ke id.
export function profileLabel(profile: Profile): string {
  return profile.full_name || profile.email || profile.id;
}
