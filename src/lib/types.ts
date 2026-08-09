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
  assigned_to: string | null;
  created_by: string | null;
};

export type LeadActivityType = "status_change" | "note";

export type LeadActivity = {
  id: string;
  lead_id: string;
  type: LeadActivityType;
  content: string | null;
  old_status: LeadStatus | null;
  new_status: LeadStatus | null;
  created_at: string;
  created_by: string | null;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
};
