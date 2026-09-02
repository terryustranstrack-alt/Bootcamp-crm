import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsView from "@/components/SettingsView";

export const dynamic = "force-dynamic";

// Halaman "Settings" — cuma admin. Berisi sync template WhatsApp & kelola
// quick reply bersama. (Pengecekan admin diulang di sini seperti /sales.)
export default async function SettingsPage() {
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

  return <SettingsView />;
}
