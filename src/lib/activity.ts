import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/client";
import type { LeadStatus } from "@/lib/types";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

// Catat satu baris riwayat di tabel `lead_activities` setiap kali status
// sebuah lead berubah (mis. "Baru" -> "Dihubungi"). Dipakai di
// LeadDetail/LeadBoard/ProspekTable setiap kali user ganti dropdown status.
// Return: pesan error kalau gagal simpan, atau null kalau berhasil.
export async function logStatusChange(
  supabase: SupabaseBrowserClient,
  leadId: string,
  oldStatus: LeadStatus,
  newStatus: LeadStatus,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    type: "status_change",
    old_status: oldStatus,
    new_status: newStatus,
    created_by: user?.id ?? null,
  });

  return error?.message ?? null;
}

// Catat satu baris riwayat berisi catatan bebas (teks) untuk sebuah lead —
// dipakai baik untuk catatan manual dari sales maupun ringkasan otomatis
// "Lead data updated: ..." saat form edit disimpan.
// Return: pesan error kalau gagal simpan, atau null kalau berhasil.
export async function logNote(
  supabase: SupabaseBrowserClient,
  leadId: string,
  content: string,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    type: "note",
    content,
    created_by: user?.id ?? null,
  });

  return error?.message ?? null;
}

// Catat sebuah pesan WhatsApp (masuk atau keluar) ke riwayat aktivitas lead.
// Menerima client apa saja (browser / server / service-role) supaya bisa
// dipanggil dari webhook (service-role, tanpa sesi) maupun dari server action
// balasan (server client). created_by diisi kalau kebetulan ada sesi user.
export async function logWhatsappActivity(
  supabase: SupabaseClient,
  leadId: string,
  content: string,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    type: "whatsapp_message",
    content,
    created_by: user?.id ?? null,
  });

  return error?.message ?? null;
}
