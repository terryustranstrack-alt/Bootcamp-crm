import type { LeadStatus } from "@/lib/types";

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

export function needsFollowUp(
  status: LeadStatus,
  tanggalUpdate: string,
): boolean {
  const threshold = THRESHOLD_HARI[status];
  if (threshold == null) return false;
  return daysSinceUpdate(tanggalUpdate) >= threshold;
}
