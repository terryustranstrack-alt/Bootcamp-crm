import type { Lead } from "@/lib/types";

// Bentuk data form "Edit Lead". Dipakai bareng oleh LeadDetail (halaman
// detail) dan ProspekTable (edit inline per baris) supaya logika edit lead
// cuma ditulis sekali di sini.
export type LeadEditForm = {
  nama: string;
  kontak: string;
  sumber: string;
  produk: string;
  estimasi_nilai: string; // string karena input, dikonversi ke number saat simpan
  kota: string;
  perusahaan: string;
  jabatan: string;
  catatan: string;
  assigned_to: string;
};

// Isi form edit dari data lead yang sedang dibuka.
export function leadToEditForm(lead: Lead): LeadEditForm {
  return {
    nama: lead.nama,
    kontak: lead.kontak,
    sumber: lead.sumber ?? "",
    produk: lead.produk ?? "",
    estimasi_nilai:
      lead.estimasi_nilai != null ? String(lead.estimasi_nilai) : "",
    kota: lead.kota ?? "",
    perusahaan: lead.perusahaan ?? "",
    jabatan: lead.jabatan ?? "",
    catatan: lead.catatan ?? "",
    assigned_to: lead.assigned_to ?? "",
  };
}

// Bangun payload update untuk tabel `leads` dari form, plus daftar label
// field mana saja yang benar-benar berubah — dipakai untuk ringkasan di
// riwayat aktivitas ("Lead data updated: name, city."), bukan cuma "diedit".
//
// isAdmin menentukan apakah assignee boleh diubah: sales biasa (non-admin)
// tidak boleh memindahkan lead ke orang lain (lihat migration 0007), jadi
// nilai assignee-nya dikunci ke nilai lama.
export function buildLeadUpdate(
  form: LeadEditForm,
  lead: Lead,
  isAdmin: boolean,
): { update: Record<string, unknown>; changedLabels: string[] } {
  const sumberBaru = form.sumber || null;
  const produkBaru = form.produk || null;
  const estimasiBaru = form.estimasi_nilai ? Number(form.estimasi_nilai) : null;
  const kotaBaru = form.kota || null;
  const perusahaanBaru = form.perusahaan || null;
  const jabatanBaru = form.jabatan || null;
  const assignedToBaru = isAdmin ? form.assigned_to || null : lead.assigned_to;

  const changedLabels: string[] = [];
  if (form.nama !== lead.nama) changedLabels.push("name");
  if (form.kontak !== lead.kontak) changedLabels.push("contact");
  if (sumberBaru !== lead.sumber) changedLabels.push("source");
  if (produkBaru !== lead.produk) changedLabels.push("product");
  if (estimasiBaru !== lead.estimasi_nilai) {
    changedLabels.push("estimated value");
  }
  if (kotaBaru !== lead.kota) changedLabels.push("city");
  if (perusahaanBaru !== lead.perusahaan) changedLabels.push("company");
  if (jabatanBaru !== lead.jabatan) changedLabels.push("job title");
  if ((form.catatan || "") !== (lead.catatan || "")) {
    changedLabels.push("notes");
  }
  if (isAdmin && assignedToBaru !== lead.assigned_to) {
    changedLabels.push("assignee");
  }

  return {
    update: {
      nama: form.nama,
      kontak: form.kontak,
      sumber: sumberBaru,
      produk: produkBaru,
      estimasi_nilai: estimasiBaru,
      kota: kotaBaru,
      perusahaan: perusahaanBaru,
      jabatan: jabatanBaru,
      catatan: form.catatan,
      assigned_to: assignedToBaru,
      tanggal_update: new Date().toISOString(),
    },
    changedLabels,
  };
}
