export const LEAD_STATUSES = [
  "Baru",
  "Dihubungi",
  "Tertarik",
  "Nego",
  "Closing",
  "Hilang",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Lead = {
  id: string;
  nama: string;
  kontak: string;
  sumber: string | null;
  status: LeadStatus;
  tanggal_masuk: string;
  tanggal_update: string;
  catatan: string;
  produk: string | null;
  estimasi_nilai: number | null;
};
