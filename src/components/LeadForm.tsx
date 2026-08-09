"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSumberOptions } from "@/lib/useSumberOptions";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import SumberSelect from "@/components/SumberSelect";
import AssigneeSelect from "@/components/AssigneeSelect";

const supabase = createClient();

const EMPTY_FORM = {
  nama: "",
  kontak: "",
  sumber: "",
  produk: "",
  estimasi_nilai: "",
  assigned_to: "",
};

export default function LeadForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(
    null,
  );
  const sumberOptions = useSumberOptions();
  const profiles = useProfiles();
  const { profile: currentProfile } = useCurrentProfile();

  function updateKontak(kontak: string) {
    setForm({ ...form, kontak });
    setDuplicateWarning(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!duplicateWarning) {
      const { data: existing, error: cekError } = await supabase
        .from("leads")
        .select("nama")
        .eq("kontak", form.kontak);

      if (cekError) {
        setError(cekError.message);
        return;
      }

      if (existing && existing.length > 0) {
        const namaLain = existing.map((l) => l.nama).join(", ");
        setDuplicateWarning(
          `Kontak ini sudah terdaftar atas nama: ${namaLain}. Klik "Tetap Simpan" untuk lanjut.`,
        );
        return;
      }
    }

    setSubmitting(true);

    const { error } = await supabase.from("leads").insert({
      nama: form.nama,
      kontak: form.kontak,
      sumber: form.sumber || null,
      produk: form.produk || null,
      estimasi_nilai: form.estimasi_nilai ? Number(form.estimasi_nilai) : null,
      assigned_to: currentProfile?.is_admin
        ? form.assigned_to || null
        : (currentProfile?.id ?? null),
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setForm(EMPTY_FORM);
    setDuplicateWarning(null);
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
      <div className="flex flex-col gap-1">
        <label htmlFor="nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="nama"
          required
          value={form.nama}
          onChange={(e) => setForm({ ...form, nama: e.target.value })}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="kontak" className="text-sm font-medium">
          Kontak (nomor WA/telepon)
        </label>
        <input
          id="kontak"
          required
          value={form.kontak}
          onChange={(e) => updateKontak(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sumber" className="text-sm font-medium">
          Sumber
        </label>
        <SumberSelect
          id="sumber"
          value={form.sumber}
          onChange={(sumber) => setForm({ ...form, sumber })}
          options={sumberOptions}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="produk" className="text-sm font-medium">
          Produk/kebutuhan yang diminati
        </label>
        <input
          id="produk"
          value={form.produk}
          onChange={(e) => setForm({ ...form, produk: e.target.value })}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="estimasi_nilai" className="text-sm font-medium">
          Estimasi nilai transaksi (opsional)
        </label>
        <input
          id="estimasi_nilai"
          type="number"
          min="0"
          step="any"
          value={form.estimasi_nilai}
          onChange={(e) => setForm({ ...form, estimasi_nilai: e.target.value })}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="assigned_to" className="text-sm font-medium">
          Ditugaskan ke
        </label>
        {currentProfile?.is_admin ? (
          <AssigneeSelect
            id="assigned_to"
            value={form.assigned_to || null}
            onChange={(assigned_to) =>
              setForm({ ...form, assigned_to: assigned_to ?? "" })
            }
            profiles={profiles}
          />
        ) : (
          <p className="text-sm text-gray-500 px-3 py-2 border rounded bg-gray-50">
            {currentProfile ? profileLabel(currentProfile) : "-"}
          </p>
        )}
      </div>

      {duplicateWarning && (
        <p className="text-amber-600 text-sm">{duplicateWarning}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {submitting
          ? "Menyimpan..."
          : duplicateWarning
            ? "Tetap Simpan"
            : "Simpan Lead"}
      </button>

      {success && (
        <p className="text-green-600 text-sm">Lead berhasil disimpan.</p>
      )}
      {error && <p className="text-red-600 text-sm">Gagal menyimpan: {error}</p>}
    </form>
  );
}
