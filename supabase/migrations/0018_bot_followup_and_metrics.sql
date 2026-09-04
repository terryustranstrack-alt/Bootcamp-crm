-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Tambahan kecil untuk chatbot:
--  1. leads.created_by_bot  — menandai lead yang dibuat otomatis oleh bot
--     (untuk metrik di Dashboard).
--  2. conversations.bot_replies_paused — kalau true, bot berhenti membalas
--     otomatis (dipakai saat bot sudah mengumpulkan lead yang "matang" dan
--     menyerahkannya ke tim sales).
--  3. conversations.enrich_attempts — berapa kali bot sudah mencoba menarik
--     data lead dari chat ini; dipakai sebagai batas atas supaya panggilan AI
--     tidak berjalan tanpa henti.
-- Tidak ada perubahan RLS/realtime.

alter table leads
  add column if not exists created_by_bot boolean not null default false;

alter table conversations
  add column if not exists bot_replies_paused boolean not null default false;

alter table conversations
  add column if not exists enrich_attempts int not null default 0;
