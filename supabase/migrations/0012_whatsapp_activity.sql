-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Balasan/pesan WhatsApp ikut tercatat di riwayat aktivitas lead, jadi
-- histori satu lead (perubahan status, catatan, chat WA) ada di satu tempat.

alter table lead_activities drop constraint if exists lead_activities_type_check;
alter table lead_activities add constraint lead_activities_type_check
  check (type in ('status_change', 'note', 'whatsapp_message'));
