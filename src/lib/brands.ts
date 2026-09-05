import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Nomor pengirim (phone_number_id) sebuah brand — dipakai tiap kali mengirim
 * WhatsApp, supaya balasan keluar dari nomor yang sama dengan yang dihubungi
 * pelanggan. Satu WABA/access token dipakai bareng semua brand, cuma
 * phone_number_id yang beda. Dipakai dari botRunner.ts (service-role) dan
 * inbox/actions.ts (server client biasa) — client apa saja boleh.
 */
export async function getBrandPhoneNumberId(
  client: SupabaseClient,
  brandId: string | null,
): Promise<string> {
  if (!brandId) return "";
  const { data } = await client
    .from("brands")
    .select("phone_number_id")
    .eq("id", brandId)
    .single();
  return data?.phone_number_id ?? "";
}
