"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logNote, logStatusChange } from "@/lib/activity";
import { useSumberOptions } from "@/lib/useSumberOptions";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import SumberSelect from "@/components/SumberSelect";
import AssigneeSelect from "@/components/AssigneeSelect";
import CurrencyInput from "@/components/CurrencyInput";
import { downloadCsv, leadsToCsv, parseLeadsCsv } from "@/lib/csv";
import { needsFollowUp } from "@/lib/reminders";
import {
  LEAD_STATUSES,
  leadStatusLabel,
  type Lead,
  type LeadStatus,
} from "@/lib/types";

// Ubah timestamp ISO jadi format "YYYY-MM-DD" versi waktu lokal browser,
// supaya bisa dicocokkan dengan nilai <input type="date"> (filter tanggal).
// Tidak pakai iso.slice(0, 10) karena itu tanggal UTC, bisa beda hari
// dengan tanggal lokal pengguna.
function toLocalDateInputValue(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const supabase = createClient();

type EditForm = {
  nama: string;
  kontak: string;
  sumber: string;
  produk: string;
  estimasi_nilai: string;
  assigned_to: string;
};

// Halaman "Prospects": tabel semua lead dengan pencarian, filter
// follow-up/tanggal, edit inline per baris, serta export/import CSV.
export default function ProspekTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    nama: "",
    kontak: "",
    sumber: "",
    produk: "",
    estimasi_nilai: "",
    assigned_to: "",
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sumberOptions = useSumberOptions();
  const profiles = useProfiles();
  const { profile: currentProfile } = useCurrentProfile();

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

  // Terapkan pencarian nama + filter follow-up + filter tanggal sekaligus
  // ke daftar lead. Dihitung ulang otomatis tiap kali salah satu filter
  // berubah (useMemo).
  const filteredLeads = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (keyword && !lead.nama.toLowerCase().includes(keyword)) return false;
      if (followUpOnly && !needsFollowUp(lead.status, lead.tanggal_update)) {
        return false;
      }
      if (
        filterDate &&
        toLocalDateInputValue(lead.tanggal_update) !== filterDate
      ) {
        return false;
      }
      return true;
    });
  }, [leads, search, followUpOnly, filterDate]);

  // Baca file CSV yang dipilih user, parse jadi baris-baris lead lewat
  // parseLeadsCsv, lalu insert semuanya sekaligus ke database.
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
        `No valid rows to import (${skipped} row(s) skipped due to missing name/contact).`,
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
      `${rows.length} prospect(s) imported successfully` +
        (skipped > 0 ? `, ${skipped} row(s) skipped.` : "."),
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
      assigned_to: lead.assigned_to ?? "",
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

  // Simpan perubahan dari form edit baris ini. Sama seperti LeadDetail:
  // field yang benar-benar berubah (`perubahan`) dicatat ke riwayat
  // aktivitas sebagai ringkasan.
  async function handleSaveEdit(lead: Lead) {
    setSaving(true);

    const sumberBaru = editForm.sumber || null;
    const produkBaru = editForm.produk || null;
    const estimasiBaru = editForm.estimasi_nilai
      ? Number(editForm.estimasi_nilai)
      : null;

    // Non-admin (sales) tidak boleh ubah assignee — lihat migration 0007.
    const assignedToBaru = currentProfile?.is_admin
      ? editForm.assigned_to || null
      : lead.assigned_to;

    const perubahan: string[] = [];
    if (editForm.nama !== lead.nama) perubahan.push("name");
    if (editForm.kontak !== lead.kontak) perubahan.push("contact");
    if (sumberBaru !== lead.sumber) perubahan.push("source");
    if (produkBaru !== lead.produk) perubahan.push("product");
    if (estimasiBaru !== lead.estimasi_nilai) perubahan.push("estimated value");
    if (currentProfile?.is_admin && assignedToBaru !== lead.assigned_to) {
      perubahan.push("assignee");
    }

    const { error } = await supabase
      .from("leads")
      .update({
        nama: editForm.nama,
        kontak: editForm.kontak,
        sumber: sumberBaru,
        produk: produkBaru,
        estimasi_nilai: estimasiBaru,
        assigned_to: assignedToBaru,
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
        `Lead data updated: ${perubahan.join(", ")}.`,
      );
      if (activityError) setError(activityError);
    }

    setSaving(false);
    setEditingId(null);
    loadLeads();
  }

  if (loading) return <p className="p-8">Loading prospects...</p>;
  if (error) return <p className="p-8 text-red-600">Failed to load: {error}</p>;

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Prospects</h1>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name..."
            className="border rounded px-3 py-2 text-sm w-64"
          />
          <label className="flex items-center gap-2 border rounded px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={followUpOnly}
              onChange={(e) => setFollowUpOnly(e.target.checked)}
            />
            Needs follow-up
          </label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          {filterDate && (
            <button
              type="button"
              onClick={() => setFilterDate("")}
              className="text-sm text-gray-500 hover:underline"
            >
              Clear date filter
            </button>
          )}
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
            {importing ? "Importing..." : "Import CSV"}
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
              <th className="p-2">Name</th>
              <th className="p-2">Contact</th>
              <th className="p-2">Source</th>
              <th className="p-2">Product</th>
              <th className="p-2">Estimated Value</th>
              <th className="p-2">Assignee</th>
              <th className="p-2">Status</th>
              <th className="p-2">Last Updated</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-gray-500">
                  No matching prospects.
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
                        <CurrencyInput
                          value={editForm.estimasi_nilai}
                          onChange={(estimasi_nilai) =>
                            setEditForm({
                              ...editForm,
                              estimasi_nilai,
                            })
                          }
                          className="border rounded px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2 min-w-40">
                        {currentProfile?.is_admin ? (
                          <AssigneeSelect
                            value={editForm.assigned_to || null}
                            onChange={(assigned_to) =>
                              setEditForm({
                                ...editForm,
                                assigned_to: assigned_to ?? "",
                              })
                            }
                            profiles={profiles}
                          />
                        ) : (
                          <span className="text-gray-500">
                            {currentProfile ? profileLabel(currentProfile) : "-"}
                          </span>
                        )}
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
                      <td className="p-2">
                        {(() => {
                          const assignee = profiles.find(
                            (p) => p.id === lead.assigned_to,
                          );
                          return assignee ? profileLabel(assignee) : "-";
                        })()}
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
                          {leadStatusLabel(s)}
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
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                          className="border rounded px-2 py-1 text-xs hover:bg-gray-50"
                        >
                          Cancel
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
