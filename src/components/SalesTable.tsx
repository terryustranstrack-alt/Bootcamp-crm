"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { createSales, deleteSales, type SalesActionState } from "@/app/sales/actions";
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

  if (loading) return <p className="p-8">Loading sales data...</p>;

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sales Team</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="bg-black text-white rounded px-4 py-2 text-sm"
        >
          {showForm ? "Close" : "+ Add Sales"}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {showForm && (
        <form
          action={formAction}
          className="flex flex-col gap-4 max-w-md border rounded p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="nama" className="text-sm font-medium">
              Name
            </label>
            <input
              id="nama"
              name="nama"
              required
              className="border rounded px-3 py-2"
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
              className="border rounded px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-sm font-medium">
              Phone
            </label>
            <input id="phone" name="phone" className="border rounded px-3 py-2" />
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
              className="border rounded px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={formPending}
            className="self-start bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {formPending ? "Saving..." : "Save Sales"}
          </button>
          {formState?.error && (
            <p className="text-red-600 text-sm">{formState.error}</p>
          )}
        </form>
      )}

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Phone</th>
              <th className="p-2">Email</th>
              <th className="p-2">Prospects</th>
              <th className="p-2">Won Revenue</th>
              <th className="p-2">Potential Revenue</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
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
                      <span className="ml-2 text-xs text-gray-500 font-normal">
                        (admin)
                      </span>
                    )}
                  </td>
                  <td className="p-2">{profile.phone || "-"}</td>
                  <td className="p-2">{profile.email || "-"}</td>
                  <td className="p-2">{stat.count}</td>
                  <td className="p-2">{formatRupiah(stat.revenueClosing)}</td>
                  <td className="p-2">{formatRupiah(stat.revenuePotensial)}</td>
                  <td className="p-2">
                    {profile.is_admin ? (
                      <span className="text-xs text-gray-400">
                        Admin cannot be deleted
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDelete(profile.id)}
                        onBlur={() => setConfirmDeleteId(null)}
                        disabled={isPending}
                        className="text-red-600 border border-red-600 rounded px-2 py-1 text-xs hover:bg-red-50 disabled:opacity-50"
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
