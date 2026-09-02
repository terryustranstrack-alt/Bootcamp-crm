-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Chatbot AI (Claude) untuk membalas pesan WhatsApp masuk secara otomatis:
-- menjawab pertanyaan umum & menyapa lead baru, lalu menyerahkan ke manusia
-- kalau perlu. Konfigurasinya satu baris di tabel bot_config (dikelola admin
-- lewat halaman Settings). Default: MATIKAN.

create table if not exists bot_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  system_prompt text not null default '',
  faq text not null default '',
  max_replies_per_conversation int not null default 5,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);
insert into bot_config (id) values (1) on conflict (id) do nothing;

alter table bot_config enable row level security;

drop policy if exists "authenticated read bot config" on bot_config;
create policy "authenticated read bot config"
  on bot_config for select
  to authenticated
  using (true);

drop policy if exists "admin update bot config" on bot_config;
create policy "admin update bot config"
  on bot_config for update
  to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- Tandai pesan keluar yang dikirim oleh bot (untuk label "Bot" di inbox &
-- untuk membatasi jumlah balasan bot per percakapan).
alter table messages add column if not exists sent_by_bot boolean not null default false;
