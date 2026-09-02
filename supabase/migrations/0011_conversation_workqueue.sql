-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Inbox jadi "antrean kerja": tiap percakapan punya status open/pending/
-- resolved, plus indeks pencarian teks pesan & kontak.

-- Status penanganan percakapan. 'open' = perlu ditindaklanjuti (default),
-- 'pending' = menunggu sesuatu, 'resolved' = selesai (disembunyikan dari
-- daftar utama). Pesan masuk baru otomatis membuka lagi yang 'resolved'
-- (lihat webhook route).
alter table conversations add column if not exists status text
  not null default 'open'
  check (status in ('open', 'pending', 'resolved'));
alter table conversations add column if not exists resolved_at timestamptz;
alter table conversations add column if not exists resolved_by uuid
  references profiles(id) on delete set null;

-- Pencarian teks: trigram index supaya `ilike '%kata%'` tetap cepat saat
-- jumlah pesan sudah banyak.
create extension if not exists pg_trgm;
create index if not exists messages_text_body_trgm
  on messages using gin (text_body gin_trgm_ops);
create index if not exists conversations_display_name_trgm
  on conversations using gin (display_name gin_trgm_ops);
create index if not exists conversations_external_contact_trgm
  on conversations using gin (external_contact_id gin_trgm_ops);
