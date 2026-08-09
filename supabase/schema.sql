-- Jalankan file ini di Supabase Dashboard > SQL Editor pada project kamu.
-- Membuat tabel "leads" sesuai field & pipeline status dari panduan MVP.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  kontak text not null,
  sumber text,
  status text not null default 'Baru'
    check (status in ('Baru', 'Dihubungi', 'Tertarik', 'Nego', 'Closing', 'Hilang')),
  tanggal_masuk timestamptz not null default now(),
  tanggal_update timestamptz not null default now(),
  -- Legacy: sebelum ada lead_activities, catatan disimpan di sini sebagai
  -- teks yang di-concat manual. Kolom ini tidak ditulis lagi sejak Fase 2,
  -- dipertahankan hanya untuk menampilkan data lama.
  catatan text not null default '',
  produk text,
  estimasi_nilai numeric
);

-- Aktifkan Row Level Security supaya akses dibatasi lewat policy di bawah,
-- bukan default-open di level project (anon key akan terlihat di browser).
alter table leads enable row level security;

-- Aplikasi punya login (lihat supabase/migrations/0002_auth_policies.sql),
-- jadi hanya user yang sudah authenticated yang boleh baca/tulis tabel ini.
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

-- Lihat supabase/migrations/0003_delete_policy.sql
create policy "authenticated can delete leads"
  on leads for delete
  to authenticated
  using (true);

-- Lihat supabase/migrations/0004_lead_activities.sql
-- Riwayat aktivitas per lead (perubahan status & catatan), append-only.
create table if not exists lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  type text not null check (type in ('status_change', 'note')),
  content text,
  old_status text,
  new_status text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table lead_activities enable row level security;

create policy "authenticated can read lead activities"
  on lead_activities for select
  to authenticated
  using (true);

create policy "authenticated can insert lead activities"
  on lead_activities for insert
  to authenticated
  with check (true);
