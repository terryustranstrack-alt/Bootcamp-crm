import {
  leadStatusFromLabel,
  leadStatusLabel,
  type Lead,
  type LeadStatus,
} from "@/lib/types";

// Daftar kolom CSV untuk fitur Export CSV di ProspekTable: header yang
// muncul di file, dan cara mengambil nilainya dari satu baris Lead. Kolom
// "Brand" butuh nama brand (bukan cuma id), jadi diberi peta id->nama lewat
// leadsToCsv() — lihat komentar di sana.
const KOLOM: {
  header: string;
  value: (lead: Lead, brandNames: Record<string, string>) => string;
}[] = [
  { header: "Name", value: (lead) => lead.nama },
  { header: "Contact", value: (lead) => lead.kontak },
  { header: "Source", value: (lead) => lead.sumber ?? "" },
  {
    header: "Brand",
    value: (lead, brandNames) =>
      (lead.brand_id && brandNames[lead.brand_id]) || "",
  },
  { header: "Company", value: (lead) => lead.perusahaan ?? "" },
  { header: "Job Title", value: (lead) => lead.jabatan ?? "" },
  { header: "Email", value: (lead) => lead.email ?? "" },
  { header: "City", value: (lead) => lead.kota ?? "" },
  { header: "Status", value: (lead) => leadStatusLabel(lead.status) },
  { header: "Product", value: (lead) => lead.produk ?? "" },
  {
    header: "Estimated Value",
    value: (lead) =>
      lead.estimasi_nilai != null ? String(lead.estimasi_nilai) : "",
  },
  { header: "Notes", value: (lead) => lead.catatan ?? "" },
  {
    header: "Date Added",
    value: (lead) => new Date(lead.tanggal_masuk).toLocaleString("id-ID"),
  },
  {
    header: "Last Updated",
    value: (lead) => new Date(lead.tanggal_update).toLocaleString("id-ID"),
  },
];

// Bungkus satu nilai kolom dengan tanda kutip kalau isinya mengandung
// koma/kutip/baris baru, supaya tetap terbaca sebagai 1 kolom oleh Excel.
function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// Ubah daftar lead jadi teks CSV siap didownload (dipakai tombol Export CSV).
// `brandNames` = peta brand id -> nama brand (dari useBrands() di pemanggil),
// dipakai cuma untuk mengisi kolom "Brand" dengan nama, bukan id mentah.
export function leadsToCsv(
  leads: Lead[],
  brandNames: Record<string, string> = {},
): string {
  const header = KOLOM.map((k) => escapeCsvField(k.header)).join(",");
  const rows = leads.map((lead) =>
    KOLOM.map((k) => escapeCsvField(k.value(lead, brandNames))).join(","),
  );
  return [header, ...rows].join("\n");
}

// Trigger download file CSV lewat browser (bikin link sementara lalu klik
// otomatis) — trik standar karena tidak ada API "save file" langsung.
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export type NewLeadInput = {
  nama: string;
  kontak: string;
  sumber: string | null;
  status: LeadStatus;
  produk: string | null;
  estimasi_nilai: number | null;
  kota: string | null;
  perusahaan: string | null;
  jabatan: string | null;
  email: string | null;
  catatan: string;
};

// Pecah satu baris teks CSV jadi array kolom, dengan menangani kutip ganda
// (field yang di-escape lewat `escapeCsvField`). Parser CSV manual sederhana
// karena tidak ada library CSV di project ini.
function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let currentColumn = "";
  let insideQuotedField = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (insideQuotedField) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          // Kutip ganda "" di dalam field artinya satu karakter kutip literal.
          currentColumn += '"';
          i++;
        } else {
          insideQuotedField = false;
        }
      } else {
        currentColumn += char;
      }
    } else if (char === '"') {
      insideQuotedField = true;
    } else if (char === ",") {
      columns.push(currentColumn);
      currentColumn = "";
    } else {
      currentColumn += char;
    }
  }
  columns.push(currentColumn);
  return columns;
}

// Cari index kolom dari daftar nama yang diterima — dicoba satu-satu
// sampai ketemu. Dipakai supaya file CSV lama (header Bahasa Indonesia,
// dari sebelum UI diterjemahkan) dan file baru (header Bahasa Inggris)
// sama-sama bisa diimpor.
function findColumnIndex(headerColumns: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headerColumns.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Mengenali kolom "Name"/"Nama", "Contact"/"Kontak", "Source"/"Sumber",
 * "Status", "Product"/"Produk", "Estimated Value"/"Estimasi Nilai",
 * "Company"/"Perusahaan", "Job Title"/"Jabatan", "Email", "City"/"Kota",
 * "Notes"/"Catatan" (urutan bebas, header lain diabaikan). Baris tanpa
 * nama/kontak dilewati. Tanggal masuk/update tidak diimpor, dibiarkan
 * default database (waktu import).
 */
export function parseLeadsCsv(text: string): {
  rows: NewLeadInput[];
  skipped: number;
} {
  // Buang BOM (marker UTF-8) yang sering ditambahkan Excel di awal file.
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], skipped: 0 };

  // Cari posisi tiap kolom yang dikenali dari baris header (case-insensitive).
  const headerColumns = parseCsvLine(lines[0]).map((h) =>
    h.trim().toLowerCase(),
  );
  const namaColumnIndex = findColumnIndex(headerColumns, ["name", "nama"]);
  const kontakColumnIndex = findColumnIndex(headerColumns, ["contact", "kontak"]);
  const sumberColumnIndex = findColumnIndex(headerColumns, ["source", "sumber"]);
  const statusColumnIndex = findColumnIndex(headerColumns, ["status"]);
  const produkColumnIndex = findColumnIndex(headerColumns, ["product", "produk"]);
  const estimasiColumnIndex = headerColumns.findIndex(
    (h) => h.startsWith("estimated") || h.startsWith("estimasi"),
  );
  const perusahaanColumnIndex = findColumnIndex(headerColumns, [
    "company",
    "perusahaan",
  ]);
  const jabatanColumnIndex = findColumnIndex(headerColumns, [
    "job title",
    "jabatan",
  ]);
  const emailColumnIndex = findColumnIndex(headerColumns, ["email"]);
  const kotaColumnIndex = findColumnIndex(headerColumns, ["city", "kota"]);
  const catatanColumnIndex = findColumnIndex(headerColumns, [
    "notes",
    "catatan",
  ]);

  const rows: NewLeadInput[] = [];
  let skipped = 0;

  for (const rawLine of lines.slice(1)) {
    const columns = parseCsvLine(rawLine);
    const nama = namaColumnIndex >= 0 ? columns[namaColumnIndex]?.trim() : "";
    const kontak =
      kontakColumnIndex >= 0 ? columns[kontakColumnIndex]?.trim() : "";

    if (!nama || !kontak) {
      skipped++;
      continue;
    }

    const statusRaw =
      statusColumnIndex >= 0 ? columns[statusColumnIndex]?.trim() : "";
    const status = statusRaw ? leadStatusFromLabel(statusRaw) ?? "Baru" : "Baru";

    const sumber =
      sumberColumnIndex >= 0 ? columns[sumberColumnIndex]?.trim() || null : null;
    const produk =
      produkColumnIndex >= 0 ? columns[produkColumnIndex]?.trim() || null : null;
    const perusahaan =
      perusahaanColumnIndex >= 0
        ? columns[perusahaanColumnIndex]?.trim() || null
        : null;
    const jabatan =
      jabatanColumnIndex >= 0
        ? columns[jabatanColumnIndex]?.trim() || null
        : null;
    const email =
      emailColumnIndex >= 0 ? columns[emailColumnIndex]?.trim() || null : null;
    const kota =
      kotaColumnIndex >= 0 ? columns[kotaColumnIndex]?.trim() || null : null;
    const catatan =
      catatanColumnIndex >= 0 ? columns[catatanColumnIndex]?.trim() || "" : "";

    const estimasiRaw =
      estimasiColumnIndex >= 0 ? columns[estimasiColumnIndex]?.trim() : "";
    const estimasiParsed = estimasiRaw
      ? Number(estimasiRaw.replace(/[^0-9.-]/g, ""))
      : NaN;

    rows.push({
      nama,
      kontak,
      sumber,
      status,
      produk,
      estimasi_nilai: Number.isFinite(estimasiParsed) ? estimasiParsed : null,
      kota,
      perusahaan,
      jabatan,
      email,
      catatan,
    });
  }

  return { rows, skipped };
}
