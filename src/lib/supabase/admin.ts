import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client dengan service role key — bypass semua RLS. Hanya untuk operasi
 * admin (buat/hapus user login) dari Server Action. Jangan pernah diimpor
 * dari komponen "use client" atau file yang bisa masuk ke bundle browser.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
