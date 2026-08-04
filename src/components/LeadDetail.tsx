"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";

export default function LeadDetail({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catatanBaru, setCatatanBaru] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadLead() {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (error) {
      setError(error.message);
    } else {
      setLead(data as Lead);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function handleStatusChange(status: LeadStatus) {
    const { error } = await supabase
      .from("leads")
      .update({ status, tanggal_update: new Date().toISOString() })
      .eq("id", leadId);

    if (error) {
      setError(error.message);
      return;
    }
    loadLead();
  }

  async function handleAddCatatan(e: FormEvent) {
    e.preventDefault();
    if (!lead || !catatanBaru.trim()) return;

    setSubmitting(true);
    const entriBaru = `[${new Date().toLocaleString("id-ID")}] ${catatanBaru.trim()}`;
    const catatanGabungan = lead.catatan
      ? `${entriBaru}\n\n${lead.catatan}`
      : entriBaru;

    const { error } = await supabase
      .from("leads")
      .update({
        catatan: catatanGabungan,
        tanggal_update: new Date().toISOString(),
      })
      .eq("id", leadId);

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }
    setCatatanBaru("");
    loadLead();
  }

  if (loading) return <p className="p-8">Memuat lead...</p>;
  if (error) return <p className="p-8 text-red-600">Gagal memuat: {error}</p>;
  if (!lead) return <p className="p-8">Lead tidak ditemukan.</p>;

  return (
    <main className="p-8 max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{lead.nama}</h1>
        <p className="text-sm text-gray-500">
          Masuk: {new Date(lead.tanggal_masuk).toLocaleString("id-ID")} · Update
          terakhir: {new Date(lead.tanggal_update).toLocaleString("id-ID")}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">Kontak</dt>
        <dd>{lead.kontak}</dd>

        <dt className="text-gray-500">Sumber</dt>
        <dd>{lead.sumber || "-"}</dd>

        <dt className="text-gray-500">Produk/kebutuhan</dt>
        <dd>{lead.produk || "-"}</dd>

        <dt className="text-gray-500">Estimasi nilai</dt>
        <dd>
          {lead.estimasi_nilai != null
            ? lead.estimasi_nilai.toLocaleString("id-ID")
            : "-"}
        </dd>

        <dt className="text-gray-500">Status</dt>
        <dd>
          <select
            value={lead.status}
            onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
            className="border rounded text-sm px-2 py-1"
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </dd>
      </dl>

      <div>
        <h2 className="font-medium mb-2">Riwayat catatan</h2>
        <form onSubmit={handleAddCatatan} className="flex flex-col gap-2 mb-4">
          <textarea
            value={catatanBaru}
            onChange={(e) => setCatatanBaru(e.target.value)}
            placeholder="Tambah catatan baru..."
            className="border rounded px-3 py-2 text-sm"
            rows={3}
          />
          <button
            type="submit"
            disabled={submitting || !catatanBaru.trim()}
            className="self-start bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {submitting ? "Menyimpan..." : "Tambah Catatan"}
          </button>
        </form>
        <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded p-3">
          {lead.catatan || "Belum ada catatan."}
        </pre>
      </div>
    </main>
  );
}
