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
  catatan text not null default '',
  produk text,
  estimasi_nilai numeric
);

-- Aktifkan Row Level Security supaya akses dibatasi lewat policy di bawah,
-- bukan default-open di level project (anon key akan terlihat di browser).
alter table leads enable row level security;

-- MVP ini belum ada login, jadi anon key perlu bisa baca & tulis tabel ini.
-- Tidak ada policy delete: MVP tidak punya fitur hapus lead.
create policy "anon can read leads"
  on leads for select
  to anon
  using (true);

create policy "anon can insert leads"
  on leads for insert
  to anon
  with check (true);

create policy "anon can update leads"
  on leads for update
  to anon
  using (true)
  with check (true);
