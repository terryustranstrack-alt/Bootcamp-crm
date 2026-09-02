-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Fondasi untuk fitur inbox berikutnya (media, kirim file, notifikasi):
--   1. wa_timestamp  — waktu asli dari WhatsApp, buat urutan pesan & jendela 24 jam
--   2. kolom media   — file media yang sudah diunduh & disimpan ke Storage
--   3. unread_count naik lewat trigger (atomic), bukan read-modify-write di webhook
--   4. bucket privat "whatsapp-media" + policy upload

-- 1. Timestamp asli dari WhatsApp (detik epoch di payload). Dipakai untuk urutan
--    pesan & hitung jendela 24 jam, bukan created_at (waktu row masuk DB).
alter table messages add column if not exists wa_timestamp timestamptz;
update messages set wa_timestamp = created_at where wa_timestamp is null;

-- 2. Media yang sudah diunduh dari WhatsApp & disimpan ke Supabase Storage.
--    media_id / media_mime_type (lama) tetap ada — itu id media di sisi Meta.
alter table messages add column if not exists media_path text;      -- path di bucket whatsapp-media
alter table messages add column if not exists media_filename text;  -- nama file asli (untuk dokumen)
alter table messages add column if not exists media_status text
  not null default 'none'
  check (media_status in ('none', 'pending', 'stored', 'failed'));

-- 3. unread_count naik otomatis lewat trigger tiap ada pesan inbound —
--    lebih aman dari read-modify-write manual di webhook (bisa balapan kalau
--    beberapa pesan masuk barengan).
create or replace function public.bump_unread_on_inbound()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.direction = 'inbound' then
    update conversations
      set unread_count = unread_count + 1
      where id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_message_inserted_bump_unread on messages;
create trigger on_message_inserted_bump_unread
  after insert on messages
  for each row execute function public.bump_unread_on_inbound();

-- 4. Bucket privat untuk menyimpan media WhatsApp (gambar, dokumen, voice note).
--    Upload (lampiran dari sales) & baca (signed URL) sama-sama lewat server
--    pakai service-role key yang mem-bypass RLS — jadi tidak perlu policy di
--    storage.objects sama sekali.
insert into storage.buckets (id, name, public)
  values ('whatsapp-media', 'whatsapp-media', false)
  on conflict (id) do nothing;
