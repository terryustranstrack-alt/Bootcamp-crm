"use client";

import { profileLabel } from "@/lib/useProfiles";
import type { Profile } from "@/lib/types";

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
      <option value="">Belum ditugaskan</option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {profileLabel(p)}
        </option>
      ))}
    </select>
  );
}
