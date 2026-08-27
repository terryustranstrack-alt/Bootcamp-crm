import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase untuk dipakai di sisi server (Server Component/Server
// Action). Sesi login dibaca/ditulis lewat cookie request saat ini.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll dipanggil dari Server Component; diabaikan karena
            // proxy.ts yang menangani refresh session di response.
          }
        },
      },
    },
  );
}
