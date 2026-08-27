"use client";

import { profileLabel } from "@/lib/useProfiles";
import type { Profile } from "@/lib/types";

// Dropdown pilih sales penanggung jawab sebuah lead. `value` null berarti
// "Unassigned". Hanya dipakai untuk admin — sales non-admin tidak
// boleh ganti assignee (lihat pengecekan currentProfile?.is_admin di
// pemanggilnya: LeadForm, LeadDetail, ProspekTable).
export default function AssigneeSelect({
  value,
  onChange,
  profiles,
  id,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  profiles: Profile[];
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="border rounded px-3 py-2"
    >
      <option value="">Unassigned</option>
      {profiles.map((profile) => (
        <option key={profile.id} value={profile.id}>
          {profileLabel(profile)}
        </option>
      ))}
    </select>
  );
}
