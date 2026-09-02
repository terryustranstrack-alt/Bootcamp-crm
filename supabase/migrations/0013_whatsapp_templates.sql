-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Template pesan WhatsApp resmi (dari Meta) — satu-satunya cara membalas
-- kontak di luar jendela 24 jam. Daftar template di-sync dari Meta oleh
-- admin (aksi syncTemplates), pesannya sendiri dikirim lewat sendTemplate.

create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text not null,           -- kode bahasa persis dari Meta (mis. 'en_US', 'id')
  category text,                    -- MARKETING / UTILITY / AUTHENTICATION
  status text,                      -- APPROVED / PENDING / REJECTED / PAUSED
  body_text text,                   -- isi komponen BODY (dengan placeholder {{1}}, {{2}}, ...)
  variable_count int not null default 0,
  header_format text,               -- TEXT / IMAGE / VIDEO / DOCUMENT / null
  components jsonb,                 -- komponen mentah dari Meta (untuk referensi)
  synced_at timestamptz not null default now(),
  unique (name, language)
);

alter table whatsapp_templates enable row level security;

drop policy if exists "authenticated read whatsapp templates" on whatsapp_templates;
create policy "authenticated read whatsapp templates"
  on whatsapp_templates for select
  to authenticated
  using (true);
-- Tidak ada policy insert/update/delete: penulisan hanya lewat service-role
-- (aksi admin syncTemplates di src/app/inbox/actions.ts).

-- Pesan bertipe 'template' ikut dicatat di tabel messages.
alter table messages drop constraint if exists messages_type_check;
alter table messages add constraint messages_type_check
  check (type in ('text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'unsupported', 'template'));
