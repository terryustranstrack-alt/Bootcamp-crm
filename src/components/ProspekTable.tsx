"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logNote, logStatusChange } from "@/lib/activity";
import { useSumberOptions } from "@/lib/useSumberOptions";
import SumberSelect from "@/components/SumberSelect";
import { downloadCsv, leadsToCsv, parseLeadsCsv } from "@/lib/csv";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";

const supabase = createClient();

type EditForm = {
  nama: string;
  kontak: string;
  sumber: string;
  produk: string;
  estimasi_nilai: string;
};

export default function ProspekTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    nama: "",
    kontak: "",
    sumber: "",
    produk: "",
    estimasi_nilai: "",
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sumberOptions = useSumberOptions();

  async function loadLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("nama", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setLeads(data as Lead[]);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeads();
  }, []);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => lead.nama.toLowerCase().includes(q));
  }, [leads, search]);

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportMessage(null);

    const text = await file.text();
    const { rows, skipped } = parseLeadsCsv(text);

    if (rows.length === 0) {
      setImportMessage(
        `Tidak ada baris valid untuk diimpor (${skipped} baris dilewati karena nama/kontak kosong).`,
      );
      setImporting(false);
      return;
    }

    const { error } = await supabase.from("leads").insert(rows);

    setImporting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setImportMessage(
      `${rows.length} prospek berhasil diimpor` +
        (skipped > 0 ? `, ${skipped} baris dilewati.` : "."),
    );
    loadLeads();
  }

  function startEdit(lead: Lead) {
    setEditingId(lead.id);
    setEditForm({
      nama: lead.nama,
      kontak: lead.kontak,
      sumber: lead.sumber ?? "",
      produk: lead.produk ?? "",
      estimasi_nilai:
        lead.estimasi_nilai != null ? String(lead.estimasi_nilai) : "",
    });
  }

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    if (status === lead.status) return;

    const { error } = await supabase
      .from("leads")
      .update({ status, tanggal_update: new Date().toISOString() })
      .eq("id", lead.id);

    if (error) {
      setError(error.message);
      return;
    }
    const activityError = await logStatusChange(
      supabase,
      lead.id,
      lead.status,
      status,
    );
    if (activityError) setError(activityError);
    loadLeads();
  }

  async function handleSaveEdit(lead: Lead) {
    setSaving(true);

    const sumberBaru = editForm.sumber || null;
    const produkBaru = editForm.produk || null;
    const estimasiBaru = editForm.estimasi_nilai
      ? Number(editForm.estimasi_nilai)
      : null;

    const perubahan: string[] = [];
    if (editForm.nama !== lead.nama) perubahan.push("nama");
    if (editForm.kontak !== lead.kontak) perubahan.push("kontak");
    if (sumberBaru !== lead.sumber) perubahan.push("sumber");
    if (produkBaru !== lead.produk) perubahan.push("produk");
    if (estimasiBaru !== lead.estimasi_nilai) perubahan.push("estimasi nilai");

    const { error } = await supabase
      .from("leads")
      .update({
        nama: editForm.nama,
        kontak: editForm.kontak,
        sumber: sumberBaru,
        produk: produkBaru,
        estimasi_nilai: estimasiBaru,
        tanggal_update: new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    if (perubahan.length > 0) {
      const activityError = await logNote(
        supabase,
        lead.id,
        `Data lead diperbarui: ${perubahan.join(", ")}.`,
      );
      if (activityError) setError(activityError);
    }

    setSaving(false);
    setEditingId(null);
    loadLeads();
  }

  if (loading) return <p className="p-8">Memuat data prospek...</p>;
  if (error) return <p className="p-8 text-red-600">Gagal memuat: {error}</p>;

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Data Prospek</h1>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama..."
            className="border rounded px-3 py-2 text-sm w-64"
          />
          <button
            type="button"
            onClick={() =>
              downloadCsv(`leads-${Date.now()}.csv`, leadsToCsv(leads))
            }
            className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
          >
            Export CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {importing ? "Mengimpor..." : "Import CSV"}
          </button>
        </div>
      </div>

      {importMessage && (
        <p className="text-sm text-gray-600">{importMessage}</p>
      )}

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="p-2">Nama</th>
              <th className="p-2">Kontak</th>
              <th className="p-2">Sumber</th>
              <th className="p-2">Produk</th>
              <th className="p-2">Estimasi Nilai</th>
              <th className="p-2">Status</th>
              <th className="p-2">Update Terakhir</th>
              <th className="p-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  Tidak ada prospek yang cocok.
                </td>
              </tr>
            )}
            {filteredLeads.map((lead) => {
              const isEditing = editingId === lead.id;
              return (
                <tr key={lead.id} className="border-b align-top">
                  {isEditing ? (
                    <>
                      <td className="p-2">
                        <input
                          value={editForm.nama}
                          onChange={(e) =>
                            setEditForm({ ...editForm, nama: e.target.value })
                          }
                          className="border rounded px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={editForm.kontak}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              kontak: e.target.value,
                            })
                          }
                          className="border rounded px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2 min-w-40">
                        <SumberSelect
                          value={editForm.sumber}
                          onChange={(sumber) =>
                            setEditForm({ ...editForm, sumber })
                          }
                          options={sumberOptions}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={editForm.produk}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              produk: e.target.value,
                            })
                          }
                          className="border rounded px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={editForm.estimasi_nilai}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              estimasi_nilai: e.target.value,
                            })
                          }
                          className="border rounded px-2 py-1 w-full"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-2">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium hover:underline"
                        >
                          {lead.nama}
                        </Link>
                      </td>
                      <td className="p-2">{lead.kontak}</td>
                      <td className="p-2">{lead.sumber || "-"}</td>
                      <td className="p-2">{lead.produk || "-"}</td>
                      <td className="p-2">
                        {lead.estimasi_nilai != null
                          ? lead.estimasi_nilai.toLocaleString("id-ID")
                          : "-"}
                      </td>
                    </>
                  )}

                  <td className="p-2">
                    <select
                      value={lead.status}
                      onChange={(e) =>
                        handleStatusChange(
                          lead,
                          e.target.value as LeadStatus,
                        )
                      }
                      className="border rounded text-sm px-2 py-1"
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-gray-500 whitespace-nowrap">
                    {new Date(lead.tanggal_update).toLocaleString("id-ID")}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(lead)}
                          disabled={saving}
                          className="bg-black text-white rounded px-2 py-1 text-xs disabled:opacity-50"
                        >
                          {saving ? "Menyimpan..." : "Simpan"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                          className="border rounded px-2 py-1 text-xs hover:bg-gray-50"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(lead)}
                        className="border rounded px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        Edit
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
