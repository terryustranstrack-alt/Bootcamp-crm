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

  if (loading) {
    return <p className="p-8 text-sm text-[var(--color-muted)]">Loading dashboard…</p>;
  }
  if (error) {
    return (
      <p className="p-8 text-sm text-[var(--color-danger)]">Failed to load: {error}</p>
    );
  }

  // Dipakai sebagai penyebut supaya lebar batang grafik proporsional
  // (status dengan lead terbanyak = 100% lebar). Minimal 1 supaya tidak
  // pernah dibagi nol saat semua status masih kosong.
  const maxCount = Math.max(
    1,
    ...stats.perStatus.map((statusGroup) => statusGroup.count),
  );

  const TILES = [
    { label: "Total leads", value: stats.totalLeads, accent: "brand" as const },
    {
      // The one hero number per screen — the metric worth spending the
      // brand's red on (see globals.css token comment).
      label: "Conversion rate",
      value: `${stats.conversionRate.toFixed(1)}%`,
      accent: "accent" as const,
    },
    {
      label: "New leads this week",
      value: stats.leadsMingguIni,
      accent: "brand" as const,
    },
    {
      label: "Won value",
      value: formatRupiah(stats.nilaiClosing),
      accent: "success" as const,
    },
  ];
  const ACCENT_CLASS: Record<(typeof TILES)[number]["accent"], string> = {
    brand: "text-brand",
    accent: "text-accent",
    success: "text-[var(--color-success)]",
  };

  // Status "hasil akhir" (menang/kalah) diberi warna sesuai artinya di
  // grafik batang; status yang masih berjalan tetap warna brand netral.
  const BAR_COLOR: Record<string, string> = {
    Closing: "bg-[var(--color-success)]",
    Hilang: "bg-[var(--color-danger)]",
  };

  return (
    <main className="p-8 flex flex-col gap-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {TILES.map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-[var(--color-muted)]">
              {tile.label}
            </p>
            <p
              className={`font-data text-2xl font-semibold mt-1 ${ACCENT_CLASS[tile.accent]}`}
            >
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="font-medium mb-1">Pipeline distribution</h2>
        <p className="font-data text-xs text-[var(--color-muted)] mb-4">
          Active potential: {formatRupiah(stats.pipelineAktif)}
        </p>
        <div className="flex flex-col gap-3">
          {stats.perStatus.map((statusGroup) => (
            <div key={statusGroup.status}>
              <div className="flex justify-between text-sm mb-1">
                <span>{leadStatusLabel(statusGroup.status)}</span>
                <span className="font-data text-xs text-[var(--color-muted)]">
                  {statusGroup.count} · {formatRupiah(statusGroup.totalNilai)}
                </span>
              </div>
              <div className="h-2 bg-[var(--color-muted-bg)] rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-[width] ${
                    BAR_COLOR[statusGroup.status] ?? "bg-brand"
                  }`}
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
