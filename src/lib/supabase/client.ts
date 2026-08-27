import { createBrowserClient } from "@supabase/ssr";

// Client Supabase untuk dipakai di browser (komponen "use client"). Pakai
// anon key saja, jadi akses data tetap dibatasi oleh RLS di database.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
