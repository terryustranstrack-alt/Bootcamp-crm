"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createSales,
  deleteSales,
  updateSalesBrand,
  type SalesActionState,
} from "@/app/sales/actions";
import { useBrands } from "@/lib/useBrands";
import type { Lead, Profile } from "@/lib/types";

const supabase = createClient();

function formatRupiah(n: number) {
  return n.toLocaleString("id-ID", { style: "currency", currency: "IDR" });
}

// Halaman "Sales Team" (khusus admin): daftar akun sales + statistik
// jumlah lead dan revenue per orang, plus form tambah akun baru & hapus akun.
export default function SalesTable() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const brands = useBrands();

  const [formState, formAction, formPending] = useActionState<
    SalesActionState,
    FormData
  >(createSales, undefined);

  async function loadData() {
    const [
      { data: profilesData, error: profileError },
      { data: leadsData, error: leadsError },
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name", { ascending: true }),
      supabase.from("leads").select("*"),
    ]);

    if (profileError) {
      setError(profileError.message);
    } else if (leadsError) {
      setError(leadsError.message);
    } else {
      setProfiles((profilesData ?? []) as Profile[]);
      setLeads((leadsData ?? []) as Lead[]);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  useEffect(() => {
    if (formState?.success) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowForm(false);
      loadData();
    }
  }, [formState]);

  // Ringkas leads jadi statistik per sales: jumlah lead yang ditangani,
  // total nilai yang sudah closing, dan total nilai yang masih berpotensi
  // (belum closing tapi juga belum hilang). Di-key pakai id sales
  // (assigned_to) supaya gampang dicocokkan ke tiap baris tabel di bawah.
  const statsPerSales = useMemo(() => {
    const map = new Map<
      string,
      { count: number; revenueClosing: number; revenuePotensial: number }
    >();
    for (const lead of leads) {
      if (!lead.assigned_to) continue;
      const currentStat = map.get(lead.assigned_to) ?? {
        count: 0,
        revenueClosing: 0,
        revenuePotensial: 0,
      };
      currentStat.count += 1;
      if (lead.status === "Closing") {
        currentStat.revenueClosing += lead.estimasi_nilai ?? 0;
      } else if (lead.status !== "Hilang") {
        currentStat.revenuePotensial += lead.estimasi_nilai ?? 0;
      }
      map.set(lead.assigned_to, currentStat);
    }
    return map;
  }, [leads]);

  // Ganti brand (tim sales) seorang akun lewat dropdown per baris.
  function handleBrandChange(profileId: string, brandId: string) {
    startTransition(async () => {
      const result = await updateSalesBrand(profileId, brandId || null);
      if (result?.error) setError(result.error);
      else loadData();
    });
  }

  // Hapus akun sales — sama seperti hapus lead, pakai pola "klik dua kali
  // untuk konfirmasi" (lihat komentar handleDelete di LeadDetail.tsx).
  function handleDelete(profileId: string) {
    if (confirmDeleteId !== profileId) {
      setConfirmDeleteId(profileId);
      return;
    }
    startTransition(async () => {
      const result = await deleteSales(profileId);
      if (result?.error) {
        setError(result.error);
      } else {
        loadData();
      }
      setConfirmDeleteId(null);
    });
  }

  if (loading) {
    return <p className="p-8 text-sm text-[var(--color-muted)]">Loading sales data...</p>;
  }

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Sales Team</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {showForm ? "Close" : "+ Add Sales"}
        </button>
      </div>

      {error && <p className="text-[var(--color-danger)] text-sm">{error}</p>}

      {showForm && (
        <form
          action={formAction}
          className="flex flex-col gap-4 max-w-md border border-[var(--color-border)] rounded-xl p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="nama" className="text-sm font-medium">
              Name
            </label>
            <input
              id="nama"
              name="nama"
              required
              className="border border-[var(--color-border)] rounded-lg px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="border border-[var(--color-border)] rounded-lg px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-sm font-medium">
              Phone
            </label>
            <input id="phone" name="phone" className="border border-[var(--color-border)] rounded-lg px-3 py-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              className="border border-[var(--color-border)] rounded-lg px-3 py-2"
            />
          </div>
          {brands.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="brand_id" className="text-sm font-medium">
                Brand
              </label>
              <select
                id="brand_id"
                name="brand_id"
                defaultValue={brands.find((b) => b.is_default)?.id ?? ""}
                className="border border-[var(--color-border)] rounded-lg px-3 py-2"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            disabled={formPending}
            className="self-start bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {formPending ? "Saving..." : "Save Sales"}
          </button>
          {formState?.error && (
            <p className="text-[var(--color-danger)] text-sm">{formState.error}</p>
          )}
        </form>
      )}

      <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[var(--color-muted-bg)] border-b border-[var(--color-border)] text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Phone</th>
              <th className="p-2">Email</th>
              {brands.length > 1 && <th className="p-2">Brand</th>}
              <th className="p-2">Prospects</th>
              <th className="p-2">Won Revenue</th>
              <th className="p-2">Potential Revenue</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && (
              <tr>
                <td colSpan={brands.length > 1 ? 8 : 7} className="p-4 text-center text-[var(--color-muted)]">
                  No sales accounts yet.
                </td>
              </tr>
            )}
            {profiles.map((profile) => {
              const stat = statsPerSales.get(profile.id) ?? {
                count: 0,
                revenueClosing: 0,
                revenuePotensial: 0,
              };
              return (
                <tr key={profile.id} className="border-b align-top">
                  <td className="p-2 font-medium">
                    {profile.full_name || "-"}
                    {profile.is_admin && (
                      <span className="ml-2 text-xs text-[var(--color-muted)] font-normal">
                        (admin)
                      </span>
                    )}
                  </td>
                  <td className="p-2">{profile.phone || "-"}</td>
                  <td className="p-2">{profile.email || "-"}</td>
                  {brands.length > 1 && (
                    <td className="p-2">
                      <select
                        value={profile.brand_id ?? ""}
                        onChange={(e) =>
                          handleBrandChange(profile.id, e.target.value)
                        }
                        disabled={isPending}
                        className="border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs disabled:opacity-50"
                      >
                        <option value="">— unset —</option>
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="p-2">{stat.count}</td>
                  <td className="p-2">{formatRupiah(stat.revenueClosing)}</td>
                  <td className="p-2">{formatRupiah(stat.revenuePotensial)}</td>
                  <td className="p-2">
                    {profile.is_admin ? (
                      <span className="text-xs text-[var(--color-muted)]">
                        Admin cannot be deleted
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDelete(profile.id)}
                        onBlur={() => setConfirmDeleteId(null)}
                        disabled={isPending}
                        className="text-[var(--color-danger)] border border-[var(--color-danger)] rounded-lg px-2 py-1 text-xs hover:bg-red-50 disabled:opacity-50"
                      >
                        {confirmDeleteId === profile.id ? "Confirm delete?" : "Delete"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
