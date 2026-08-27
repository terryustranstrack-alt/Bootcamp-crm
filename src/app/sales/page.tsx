import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SalesTable from "@/components/SalesTable";

export const dynamic = "force-dynamic";

// Halaman "Sales Team" — cuma boleh diakses admin. Proxy.ts sudah jaga
// halaman ini butuh login, tapi pengecekan admin harus dicek lagi di sini
// karena itu aturan khusus halaman ini, bukan aturan login secara umum.
export default async function SalesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  return <SalesTable />;
}
