"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LEAD_STATUSES, type Lead } from "@/lib/types";

const supabase = createClient();
const SATU_MINGGU_MS = 7 * 24 * 60 * 60 * 1000;

function formatRupiah(n: number) {
  return n.toLocaleString("id-ID", { style: "currency", currency: "IDR" });
}

export default function Dashboard() {
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
    const totalLeads = leads.length;
    const perStatus = LEAD_STATUSES.map((status) => {
      const leadsInStatus = leads.filter((l) => l.status === status);
      const totalNilai = leadsInStatus.reduce(
        (sum, l) => sum + (l.estimasi_nilai ?? 0),
        0,
      );
      return { status, count: leadsInStatus.length, totalNilai };
    });

    const closingCount = perStatus.find((p) => p.status === "Closing")?.count ?? 0;
    const conversionRate = totalLeads > 0 ? (closingCount / totalLeads) * 100 : 0;

    const leadsMingguIni = leads.filter(
      (l) => now - new Date(l.tanggal_masuk).getTime() <= SATU_MINGGU_MS,
    ).length;

    const pipelineAktif = leads
      .filter((l) => l.status !== "Closing" && l.status !== "Hilang")
      .reduce((sum, l) => sum + (l.estimasi_nilai ?? 0), 0);

    const nilaiClosing = perStatus.find((p) => p.status === "Closing")?.totalNilai ?? 0;

    return {
      totalLeads,
      perStatus,
      conversionRate,
      leadsMingguIni,
      pipelineAktif,
      nilaiClosing,
    };
  }, [leads, now]);

  if (loading) return <p className="p-8">Memuat dashboard...</p>;
  if (error) return <p className="p-8 text-red-600">Gagal memuat: {error}</p>;

  const maxCount = Math.max(1, ...stats.perStatus.map((p) => p.count));

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
          <p className="text-xs text-gray-500">Lead Masuk Minggu Ini</p>
          <p className="text-2xl font-semibold">{stats.leadsMingguIni}</p>
        </div>
        <div className="border rounded p-4">
          <p className="text-xs text-gray-500">Nilai Closing</p>
          <p className="text-2xl font-semibold">
            {formatRupiah(stats.nilaiClosing)}
          </p>
        </div>
      </div>

      <div>
        <h2 className="font-medium mb-3">
          Distribusi Pipeline (potensi aktif: {formatRupiah(stats.pipelineAktif)})
        </h2>
        <div className="flex flex-col gap-3">
          {stats.perStatus.map((p) => (
            <div key={p.status}>
              <div className="flex justify-between text-sm mb-1">
                <span>{p.status}</span>
                <span className="text-gray-500">
                  {p.count} lead · {formatRupiah(p.totalNilai)}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded">
                <div
                  className="h-2 bg-black rounded"
                  style={{ width: `${(p.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
