"use client";

import { createClient } from "@/lib/supabase/client";
import { logStatusChange } from "@/lib/activity";
import type { LeadStatus } from "@/lib/types";

const supabase = createClient();

// Ganti status sebuah lead dan catat perubahannya ke riwayat aktivitas.
// Dipakai bareng oleh LeadDetail dan panel konteks lead di Inbox.
// Return: pesan error kalau gagal, atau null kalau berhasil.
export async function changeLeadStatus(
  leadId: string,
  oldStatus: LeadStatus,
  newStatus: LeadStatus,
): Promise<string | null> {
  if (oldStatus === newStatus) return null;

  const { error } = await supabase
    .from("leads")
    .update({ status: newStatus, tanggal_update: new Date().toISOString() })
    .eq("id", leadId);
  if (error) return error.message;

  return logStatusChange(supabase, leadId, oldStatus, newStatus);
}
