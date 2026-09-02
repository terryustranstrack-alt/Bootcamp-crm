-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Menambah field data calon pelanggan yang lebih lengkap ke tabel "leads":
-- kota, perusahaan, dan jabatan. Tidak ada perubahan RLS/realtime — kolom
-- baru ikut policy silo per-sales yang sudah ada (lihat 0007).

alter table leads add column if not exists kota text;
alter table leads add column if not exists perusahaan text;
alter table leads add column if not exists jabatan text;

-- Kolom "catatan" dulu legacy (teks catatan lama sebelum ada lead_activities).
-- Mulai sekarang dipakai lagi sebagai field "Notes / requirements" yang bisa
-- diedit dari form Add/Edit Lead. Data lama tetap jadi nilai awalnya.
-- Struktur kolomnya tidak berubah: text not null default ''.
