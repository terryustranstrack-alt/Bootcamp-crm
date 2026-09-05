"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SalesActionState = { error?: string; success?: boolean } | undefined;

// Pastikan yang memanggil Server Action ini sudah login DAN adalah admin.
// Dipanggil di awal setiap action di file ini karena mengelola akun sales
// itu operasi sensitif (pakai service role key yang bypass RLS).
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, error: "Not logged in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return { ok: false as const, error: "Only admins can manage sales data." };
  }

  return { ok: true as const };
}

// Buat akun login baru untuk seorang sales (dipakai admin lewat form
// "+ Add Sales"). Baris `profiles` untuk akun ini dibuat otomatis oleh
// trigger database `handle_new_user`, jadi di sini tinggal lengkapi nomor
// telepon setelah user-nya jadi.
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
  const brandId = String(formData.get("brand_id") ?? "").trim();

  if (!nama || !email || !password) {
    return { error: "Name, email, and password are required." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: nama },
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Failed to create sales account." };
  }

  // Trigger handle_new_user sudah insert baris profiles; lengkapi no telp
  // & brand (tim sales mana yang dia tangani — menentukan pool "belum
  // diklaim" mana yang boleh dia lihat).
  const { error: profileError } = await admin
    .from("profiles")
    .update({ phone: phone || null, brand_id: brandId || null })
    .eq("id", data.user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/sales");
  return { success: true };
}

// Ganti brand (tim sales) seorang akun sales. Dipanggil dari dropdown per
// baris di tabel Sales Team.
export async function updateSalesBrand(
  profileId: string,
  brandId: string | null,
): Promise<SalesActionState> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return { error: adminCheck.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ brand_id: brandId })
    .eq("id", profileId);

  if (error) return { error: error.message };
  revalidatePath("/sales");
  return { success: true };
}

// Hapus akun login seorang sales. Akun admin sengaja tidak boleh dihapus
// lewat sini supaya sistem tidak pernah kehabisan admin (terkunci total).
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
    return { error: "Admin accounts cannot be deleted (to avoid getting locked out of the system)." };
  }

  const { error } = await admin.auth.admin.deleteUser(profileId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/sales");
  return { success: true };
}
