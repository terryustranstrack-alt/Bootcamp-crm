"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import ChatMetrics from "@/components/ChatMetrics";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { useBrands } from "@/lib/useBrands";

// Bungkus Dashboard + ChatMetrics dengan satu dropdown brand yang dipakai
// bareng (admin-only — sales biasa cuma pernah lihat brand-nya sendiri lewat
// RLS, jadi tidak perlu dropdown). "Separate dashboard per brand" diwujudkan
// sebagai filter di dashboard yang sama, bukan halaman terpisah.
export default function DashboardView() {
  const { profile: currentProfile } = useCurrentProfile();
  const brands = useBrands();
  const [brandFilter, setBrandFilter] = useState("all");

  return (
    <>
      {currentProfile?.is_admin && brands.length > 1 && (
        <div className="px-8 pt-6">
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Dashboard brandFilter={brandFilter} />
      <ChatMetrics brandFilter={brandFilter} />
    </>
  );
}
