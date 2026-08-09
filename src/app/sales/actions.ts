"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SalesActionState = { error?: string; success?: boolean } | undefined;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, error: "Belum login." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return { ok: false as const, error: "Hanya admin yang bisa mengelola data sales." };
  }

  return { ok: true as const };
}

export async function createSales(
  _state: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return { error: adminCheck.error };

  const nama = String(formData.get("nama") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!nama || !email || !password) {
    return { error: "Nama, email, dan password wajib diisi." };
  }
  if (password.length < 6) {
    return { error: "Password minimal 6 karakter." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: nama },
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Gagal membuat akun sales." };
  }

  // Trigger handle_new_user sudah insert baris profiles; lengkapi no telp.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ phone: phone || null })
    .eq("id", data.user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/sales");
  return { success: true };
}

export async function deleteSales(profileId: string): Promise<SalesActionState> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return { error: adminCheck.error };

  const admin = createAdminClient();

  const { data: targetProfile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", profileId)
    .single();

  if (targetProfile?.is_admin) {
    return { error: "Akun admin tidak bisa dihapus (supaya tidak terkunci dari sistem)." };
  }

  const { error } = await admin.auth.admin.deleteUser(profileId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/sales");
  return { success: true };
}
