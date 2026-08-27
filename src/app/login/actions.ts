"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

// Proses form login: cek email/password ke Supabase Auth, redirect ke
// halaman utama kalau berhasil, atau balikin pesan error kalau salah.
export async function signIn(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  redirect("/");
}

// Logout — dipanggil dari tombol "Log Out" di layout.tsx.
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
