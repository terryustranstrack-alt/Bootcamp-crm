-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Menambah "welcome_message" ke konfigurasi chatbot: pesan pembuka yang
-- dikirim apa adanya (tanpa lewat AI) saat kontak WhatsApp mengirim pesan
-- untuk PERTAMA kalinya — biasanya dipakai untuk menyapa & menanyakan data
-- calon pelanggan sekaligus. Kalau dikosongkan, bot langsung menjawab lewat
-- AI seperti biasa. Ikut saklar "enabled" yang sama.

alter table bot_config
  add column if not exists welcome_message text not null default '';
