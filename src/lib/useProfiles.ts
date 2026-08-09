"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const supabase = createClient();

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

export function profileLabel(profile: Profile): string {
  return profile.full_name || profile.email || profile.id;
}
