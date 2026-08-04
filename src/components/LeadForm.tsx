"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

const EMPTY_FORM = {
  nama: "",
  kontak: "",
  sumber: "",
  produk: "",
  estimasi_nilai: "",
};

export default function LeadForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const { error } = await supabase.from("leads").insert({
      nama: form.nama,
      kontak: form.kontak,
      sumber: form.sumber || null,
      produk: form.produk || null,
      estimasi_nilai: form.estimasi_nilai ? Number(form.estimasi_nilai) : null,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setForm(EMPTY_FORM);
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
          onChange={(e) => setForm({ ...form, kontak: e.target.value })}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sumber" className="text-sm font-medium">
          Sumber
        </label>
        <input
          id="sumber"
          placeholder="Instagram Ads, Referral, Organik, ..."
          value={form.sumber}
          onChange={(e) => setForm({ ...form, sumber: e.target.value })}
          className="border rounded px-3 py-2"
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

      <button
        type="submit"
        disabled={submitting}
        className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {submitting ? "Menyimpan..." : "Simpan Lead"}
      </button>

      {success && (
        <p className="text-green-600 text-sm">Lead berhasil disimpan.</p>
      )}
      {error && <p className="text-red-600 text-sm">Gagal menyimpan: {error}</p>}
    </form>
  );
}
