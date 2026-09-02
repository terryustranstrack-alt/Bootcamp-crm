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
  kota: "",
  perusahaan: "",
  jabatan: "",
  catatan: "",
  assigned_to: "",
};

type LeadFormValues = typeof EMPTY_FORM;

type LeadFormProps = {
  // Nilai awal yang mengisi sebagian field (mis. dari inbox: nomor kontak &
  // sumber "WhatsApp" sudah diketahui). Field lain tetap kosong.
  initialValues?: Partial<LeadFormValues>;
  // Dipanggil setelah lead berhasil dibuat, dengan id lead barunya. Kalau
  // diisi, form tidak menampilkan pesan sukses sendiri — pemanggil yang
  // memutuskan apa berikutnya (mis. inbox: langsung link ke percakapan).
  onSaved?: (leadId: string) => void;
  // Kunci field kontak (tidak bisa diedit) — dipakai saat lead dibuat dari
  // sebuah percakapan WhatsApp: nomornya harus sama dengan nomor chat.
  lockContact?: boolean;
};

// Form "Add New Lead". Sebelum benar-benar simpan, dicek dulu apakah
// nomor kontak sudah pernah terdaftar — kalau iya, tampilkan peringatan dan
// minta konfirmasi sekali lagi sebelum tetap menyimpan (mencegah duplikat
// tidak sengaja, tapi tetap mengizinkan kalau memang disengaja).
//
// Dipakai di dua tempat: halaman "/leads/baru" (berdiri sendiri) dan panel
// "New Lead" di Inbox (dengan initialValues + onSaved).
export default function LeadForm({
  initialValues,
  onSaved,
  lockContact = false,
}: LeadFormProps = {}) {
  const [form, setForm] = useState<LeadFormValues>(() => ({
    ...EMPTY_FORM,
    ...initialValues,
  }));
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

    const { data: newLead, error } = await supabase
      .from("leads")
      .insert({
        nama: form.nama,
        kontak: form.kontak,
        sumber: form.sumber || null,
        produk: form.produk || null,
        estimasi_nilai: form.estimasi_nilai
          ? Number(form.estimasi_nilai)
          : null,
        kota: form.kota || null,
        perusahaan: form.perusahaan || null,
        jabatan: form.jabatan || null,
        catatan: form.catatan,
        assigned_to: currentProfile?.is_admin
          ? form.assigned_to || null
          : (currentProfile?.id ?? null),
      })
      .select("id")
      .single();

    setSubmitting(false);

    if (error || !newLead) {
      setError(error?.message ?? "Failed to save lead.");
      return;
    }

    setForm({ ...EMPTY_FORM, ...initialValues });
    setDuplicateWarning(null);

    // Kalau dipanggil dengan onSaved (mis. dari Inbox), serahkan ke pemanggil.
    // Kalau berdiri sendiri, cukup tampilkan pesan sukses.
    if (onSaved) {
      onSaved(newLead.id);
    } else {
      setSuccess(true);
    }
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
          readOnly={lockContact}
          className={`border rounded px-3 py-2 ${
            lockContact ? "bg-gray-50 text-gray-500" : ""
          }`}
        />
        {lockContact && (
          <span className="text-xs text-gray-400">
            Locked to this WhatsApp chat.
          </span>
        )}
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
        <label htmlFor="perusahaan" className="text-sm font-medium">
          Company
        </label>
        <input
          id="perusahaan"
          value={form.perusahaan}
          onChange={(e) => setForm({ ...form, perusahaan: e.target.value })}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="jabatan" className="text-sm font-medium">
          Job title
        </label>
        <input
          id="jabatan"
          value={form.jabatan}
          onChange={(e) => setForm({ ...form, jabatan: e.target.value })}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="kota" className="text-sm font-medium">
          City/region
        </label>
        <input
          id="kota"
          value={form.kota}
          onChange={(e) => setForm({ ...form, kota: e.target.value })}
          className="border rounded px-3 py-2"
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
        <label htmlFor="catatan" className="text-sm font-medium">
          Notes / requirements
        </label>
        <textarea
          id="catatan"
          value={form.catatan}
          onChange={(e) => setForm({ ...form, catatan: e.target.value })}
          rows={3}
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
