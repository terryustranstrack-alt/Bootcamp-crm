"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LEAD_STATUSES, leadStatusLabel, type Lead } from "@/lib/types";

const supabase = createClient();
const SATU_MINGGU_MS = 7 * 24 * 60 * 60 * 1000;

function formatRupiah(n: number) {
  return n.toLocaleString("id-ID", { style: "currency", currency: "IDR" });
}

// Halaman ringkasan performa: total lead, conversion rate, lead masuk
// minggu ini, nilai closing, dan grafik batang distribusi lead per status.
// `brandFilter` ("all" atau id sebuah brand) datang dari DashboardView di
// atasnya — dashboard bisa dipersempit ke satu brand (nomor WhatsApp) saja.
export default function Dashboard({
  brandFilter = "all",
}: {
  brandFilter?: string;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from("leads").select("*");
      if (error) {
        setError(error.message);
      } else {
        setLeads(data as Lead[]);
      }
      setNow(Date.now());
      setLoading(false);
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const leadsInBrand =
      brandFilter === "all"
        ? leads
        : leads.filter((lead) => lead.brand_id === brandFilter);
    const totalLeads = leadsInBrand.length;
    // Jumlah lead + total estimasi nilainya, dikelompokkan per status —
    // dipakai untuk grafik batang "Distribusi Pipeline".
    const perStatus = LEAD_STATUSES.map((status) => {
      const leadsInStatus = leadsInBrand.filter((lead) => lead.status === status);
      const totalNilai = leadsInStatus.reduce(
        (sum, lead) => sum + (lead.estimasi_nilai ?? 0),
        0,
      );
      return { status, count: leadsInStatus.length, totalNilai };
    });

    const closingCount =
      perStatus.find((statusGroup) => statusGroup.status === "Closing")
        ?.count ?? 0;
    const conversionRate = totalLeads > 0 ? (closingCount / totalLeads) * 100 : 0;

    const leadsMingguIni = leadsInBrand.filter(
      (lead) => now - new Date(lead.tanggal_masuk).getTime() <= SATU_MINGGU_MS,
    ).length;

    // Total estimasi nilai dari lead yang masih "hidup" (belum closing,
    // belum hilang) — potensi revenue yang belum terealisasi.
    const pipelineAktif = leadsInBrand
      .filter((lead) => lead.status !== "Closing" && lead.status !== "Hilang")
      .reduce((sum, lead) => sum + (lead.estimasi_nilai ?? 0), 0);

    const nilaiClosing =
      perStatus.find((statusGroup) => statusGroup.status === "Closing")
        ?.totalNilai ?? 0;

    return {
      totalLeads,
      perStatus,
      conversionRate,
      leadsMingguIni,
      pipelineAktif,
      nilaiClosing,
    };
  }, [leads, now, brandFilter]);

  if (loading) return <p className="p-8">Loading dashboard...</p>;
  if (error) return <p className="p-8 text-red-600">Failed to load: {error}</p>;

  // Dipakai sebagai penyebut supaya lebar batang grafik proporsional
  // (status dengan lead terbanyak = 100% lebar). Minimal 1 supaya tidak
  // pernah dibagi nol saat semua status masih kosong.
  const maxCount = Math.max(
    1,
    ...stats.perStatus.map((statusGroup) => statusGroup.count),
  );

  return (
    <main className="p-8 flex flex-col gap-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <p className="text-xs text-gray-500">Total Leads</p>
          <p className="text-2xl font-semibold">{stats.totalLeads}</p>
        </div>
        <div className="border rounded p-4">
          <p className="text-xs text-gray-500">Conversion Rate</p>
          <p className="text-2xl font-semibold">
            {stats.conversionRate.toFixed(1)}%
          </p>
        </div>
        <div className="border rounded p-4">
          <p className="text-xs text-gray-500">New Leads This Week</p>
          <p className="text-2xl font-semibold">{stats.leadsMingguIni}</p>
        </div>
        <div className="border rounded p-4">
          <p className="text-xs text-gray-500">Won Value</p>
          <p className="text-2xl font-semibold">
            {formatRupiah(stats.nilaiClosing)}
          </p>
        </div>
      </div>

      <div>
        <h2 className="font-medium mb-3">
          Pipeline Distribution (active potential: {formatRupiah(stats.pipelineAktif)})
        </h2>
        <div className="flex flex-col gap-3">
          {stats.perStatus.map((statusGroup) => (
            <div key={statusGroup.status}>
              <div className="flex justify-between text-sm mb-1">
                <span>{leadStatusLabel(statusGroup.status)}</span>
                <span className="text-gray-500">
                  {statusGroup.count} lead · {formatRupiah(statusGroup.totalNilai)}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded">
                <div
                  className="h-2 bg-black rounded"
                  style={{ width: `${(statusGroup.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
