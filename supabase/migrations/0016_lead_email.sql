-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Menambah kolom "email" ke tabel "leads" — alamat email calon pelanggan,
-- diisi manual dari form Add/Edit Lead atau otomatis oleh chatbot AI saat
-- lead menyebutkan emailnya di chat WhatsApp. Tidak ada perubahan
-- RLS/realtime — kolom baru ikut policy silo per-sales yang sudah ada
-- (lihat 0007).

alter table leads add column if not exists email text;
