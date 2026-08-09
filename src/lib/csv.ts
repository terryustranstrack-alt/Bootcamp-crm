import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";

const KOLOM: { header: string; value: (lead: Lead) => string }[] = [
  { header: "Nama", value: (l) => l.nama },
  { header: "Kontak", value: (l) => l.kontak },
  { header: "Sumber", value: (l) => l.sumber ?? "" },
  { header: "Status", value: (l) => l.status },
  { header: "Produk", value: (l) => l.produk ?? "" },
  {
    header: "Estimasi Nilai",
    value: (l) => (l.estimasi_nilai != null ? String(l.estimasi_nilai) : ""),
  },
  {
    header: "Tanggal Masuk",
    value: (l) => new Date(l.tanggal_masuk).toLocaleString("id-ID"),
  },
  {
    header: "Update Terakhir",
    value: (l) => new Date(l.tanggal_update).toLocaleString("id-ID"),
  },
];

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function leadsToCsv(leads: Lead[]): string {
  const header = KOLOM.map((k) => escapeCsvField(k.header)).join(",");
  const rows = leads.map((lead) =>
    KOLOM.map((k) => escapeCsvField(k.value(lead))).join(","),
  );
  return [header, ...rows].join("\n");
}

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
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Mengenali kolom "Nama", "Kontak", "Sumber", "Status", "Produk",
 * "Estimasi Nilai" (urutan bebas, header lain diabaikan). Baris tanpa
 * nama/kontak dilewati. Tanggal masuk/update tidak diimpor, dibiarkan
 * default database (waktu import).
 */
export function parseLeadsCsv(text: string): {
  rows: NewLeadInput[];
  skipped: number;
} {
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], skipped: 0 };

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idxNama = header.indexOf("nama");
  const idxKontak = header.indexOf("kontak");
  const idxSumber = header.indexOf("sumber");
  const idxStatus = header.indexOf("status");
  const idxProduk = header.indexOf("produk");
  const idxEstimasi = header.findIndex((h) => h.startsWith("estimasi"));

  const rows: NewLeadInput[] = [];
  let skipped = 0;

  for (const rawLine of lines.slice(1)) {
    const cols = parseCsvLine(rawLine);
    const nama = idxNama >= 0 ? cols[idxNama]?.trim() : "";
    const kontak = idxKontak >= 0 ? cols[idxKontak]?.trim() : "";

    if (!nama || !kontak) {
      skipped++;
      continue;
    }

    const statusRaw = idxStatus >= 0 ? cols[idxStatus]?.trim() : "";
    const status = (LEAD_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as LeadStatus)
      : "Baru";

    const sumber = idxSumber >= 0 ? cols[idxSumber]?.trim() || null : null;
    const produk = idxProduk >= 0 ? cols[idxProduk]?.trim() || null : null;

    const estimasiRaw = idxEstimasi >= 0 ? cols[idxEstimasi]?.trim() : "";
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
    });
  }

  return { rows, skipped };
}
