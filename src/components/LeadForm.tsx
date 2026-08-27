"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSumberOptions } from "@/lib/useSumberOptions";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import SumberSelect from "@/components/SumberSelect";
import AssigneeSelect from "@/components/AssigneeSelect";
import CurrencyInput from "@/components/CurrencyInput";

const supabase = createClient();

const EMPTY_FORM = {
  nama: "",
  kontak: "",
  sumber: "",
  produk: "",
  estimasi_nilai: "",
  assigned_to: "",
};

// Form "Add New Lead". Sebelum benar-benar simpan, dicek dulu apakah
// nomor kontak sudah pernah terdaftar — kalau iya, tampilkan peringatan dan
// minta konfirmasi sekali lagi sebelum tetap menyimpan (mencegah duplikat
// tidak sengaja, tapi tetap mengizinkan kalau memang disengaja).
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

  // Nomor kontak baru diketik ulang — reset peringatan duplikat lama
  // karena sudah tidak relevan lagi untuk nomor yang baru.
  function updateKontak(kontak: string) {
    setForm({ ...form, kontak });
    setDuplicateWarning(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Baru cek duplikat kalau belum ada peringatan yang sedang ditampilkan
    // — begitu user klik "Save Anyway" (duplicateWarning sudah terisi),
    // langsung lanjut simpan tanpa cek ulang.
    if (!duplicateWarning) {
      const { data: leadsWithSameContact, error: cekError } = await supabase
        .from("leads")
        .select("nama")
        .eq("kontak", form.kontak);

      if (cekError) {
        setError(cekError.message);
        return;
      }

      if (leadsWithSameContact && leadsWithSameContact.length > 0) {
        const namaLain = leadsWithSameContact.map((l) => l.nama).join(", ");
        setDuplicateWarning(
          `This contact is already registered under: ${namaLain}. Click "Save Anyway" to continue.`,
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
          Name
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
          Contact (WhatsApp/phone number)
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
          Source
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
          Product/need of interest
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
          Estimated deal value (optional)
        </label>
        <CurrencyInput
          id="estimasi_nilai"
          value={form.estimasi_nilai}
          onChange={(estimasi_nilai) => setForm({ ...form, estimasi_nilai })}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="assigned_to" className="text-sm font-medium">
          Assigned to
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
          ? "Saving..."
          : duplicateWarning
            ? "Save Anyway"
            : "Save Lead"}
      </button>

      {success && (
        <p className="text-green-600 text-sm">Lead saved successfully.</p>
      )}
      {error && <p className="text-red-600 text-sm">Failed to save: {error}</p>}
    </form>
  );
}
