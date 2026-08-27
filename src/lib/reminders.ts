import type { LeadStatus } from "@/lib/types";

// Berapa hari maksimal sebuah lead boleh "diam" (tidak di-update) di tiap
// status sebelum dianggap perlu di-follow-up. Status yang tidak ada di
// daftar ini (Closing, Hilang) tidak pernah butuh follow-up — sudah selesai.
const THRESHOLD_HARI: Partial<Record<LeadStatus, number>> = {
  Baru: 2,
  Dihubungi: 2,
  Tertarik: 4,
  Nego: 4,
};

export function daysSinceUpdate(tanggalUpdate: string): number {
  const diffMs = Date.now() - new Date(tanggalUpdate).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// True kalau lead sudah lewat batas hari diam untuk statusnya saat ini —
// dipakai untuk badge "Needs follow-up" di LeadBoard/ProspekTable.
export function needsFollowUp(
  status: LeadStatus,
  tanggalUpdate: string,
): boolean {
  const threshold = THRESHOLD_HARI[status];
  if (threshold == null) return false;
  return daysSinceUpdate(tanggalUpdate) >= threshold;
}
