-- Jalankan file ini di Supabase Dashboard > SQL Editor setelah Fase 0 (Autentikasi).
-- Mengganti akses anon (siapa saja bisa baca/tulis) menjadi authenticated saja,
-- sekarang aplikasi sudah punya login.

drop policy if exists "anon can read leads" on leads;
drop policy if exists "anon can insert leads" on leads;
drop policy if exists "anon can update leads" on leads;

create policy "authenticated can read leads"
  on leads for select
  to authenticated
  using (true);

create policy "authenticated can insert leads"
  on leads for insert
  to authenticated
  with check (true);

create policy "authenticated can update leads"
  on leads for update
  to authenticated
  using (true)
  with check (true);
