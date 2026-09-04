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
  -- Dulu legacy (catatan lama hasil concat manual sebelum ada lead_activities).
  -- Sejak 0009 dipakai lagi sebagai field "Notes / requirements" yang bisa
  -- diedit dari form Add/Edit Lead; data lama tetap jadi nilai awalnya.
  catatan text not null default '',
  produk text,
  estimasi_nilai numeric,
  -- Ditambah di 0009_lead_fields.sql — data calon pelanggan yang lebih lengkap.
  kota text,
  perusahaan text,
  jabatan text,
  -- Ditambah di 0016_lead_email.sql — alamat email lead (bisa diisi manual
  -- atau otomatis oleh chatbot AI dari isi chat WhatsApp).
  email text
);

-- Aktifkan Row Level Security supaya akses dibatasi lewat policy di bawah,
-- bukan default-open di level project (anon key akan terlihat di browser).
alter table leads enable row level security;

-- Aplikasi punya login (lihat supabase/migrations/0002_auth_policies.sql),
-- jadi hanya user yang sudah authenticated yang boleh baca/tulis tabel ini.
-- Policy select/update/delete final (dengan silo per-sales) didefinisikan
-- di bagian bawah file ini, setelah tabel "profiles" ada (lihat
-- supabase/migrations/0007_lead_visibility_rls.sql).
create policy "authenticated can insert leads"
  on leads for insert
  to authenticated
  with check (true);

-- Lihat supabase/migrations/0004_lead_activities.sql
-- Riwayat aktivitas per lead (perubahan status & catatan), append-only.
-- Policy select/insert final ada di bagian bawah file ini (butuh tabel
-- "leads" & "profiles" sudah ada untuk subquery visibilitas).
create table if not exists lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  -- 0012: 'whatsapp_message' ditambah — chat WA ikut tercatat di riwayat lead.
  type text not null check (type in ('status_change', 'note', 'whatsapp_message')),
  content text,
  old_status text,
  new_status text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table lead_activities enable row level security;

-- Lihat supabase/migrations/0005_profiles.sql
-- Representasi ringan auth.users (yang tidak bisa langsung di-query dari
-- client) supaya lead bisa di-assign ke sales tertentu.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  -- Lihat supabase/migrations/0006_sales_admin.sql
  phone text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "authenticated can read profiles"
  on profiles for select
  to authenticated
  using (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table leads add column if not exists assigned_to uuid references profiles(id) on delete set null;

-- Lihat supabase/migrations/0007_lead_visibility_rls.sql
-- Silo per-sales: sales cuma boleh akses lead yang assigned_to/created_by
-- dia sendiri; admin (profiles.is_admin) tetap akses semua.
alter table leads add column if not exists created_by uuid references profiles(id) on delete set null;

create or replace function public.set_lead_created_by()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists on_lead_insert_set_created_by on leads;
create trigger on_lead_insert_set_created_by
  before insert on leads
  for each row execute function public.set_lead_created_by();

create policy "sales read own leads, admin reads all"
  on leads for select
  to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "sales update own leads, admin updates all"
  on leads for update
  to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  )
  with check (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "sales delete own leads, admin deletes all"
  on leads for delete
  to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "read activities of visible leads"
  on lead_activities for select
  to authenticated
  using (
    exists (
      select 1 from leads l
      where l.id = lead_activities.lead_id
      and (
        l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
      )
    )
  );

create policy "insert activities of visible leads"
  on lead_activities for insert
  to authenticated
  with check (
    exists (
      select 1 from leads l
      where l.id = lead_activities.lead_id
      and (
        l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
      )
    )
  );

-- Lihat supabase/migrations/0008_whatsapp_chat.sql
-- Chat WhatsApp (Cloud API resmi) terintegrasi ke CRM. "channel" dibuat
-- extensible supaya channel lain bisa ditambah nanti tanpa redesign skema.
-- conversations.assigned_to null = belum diklaim (pool, terlihat semua
-- sales/admin); begitu diklaim/ke-link ke lead, silo per-sales sama seperti
-- tabel leads.

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  external_contact_id text not null,
  display_name text,
  lead_id uuid references leads(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int not null default 0,
  -- 0011: status antrean kerja. Pesan masuk baru otomatis membuka lagi yang 'resolved'.
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (channel, external_contact_id)
);

alter table conversations enable row level security;

create policy "read own or unclaimed conversations, admin reads all"
  on conversations for select
  to authenticated
  using (
    assigned_to is null
    or assigned_to = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "update own or unclaimed conversations, admin updates all"
  on conversations for update
  to authenticated
  using (
    assigned_to is null
    or assigned_to = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  )
  with check (
    assigned_to is null
    or assigned_to = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  wa_message_id text unique,
  -- 0013: 'template' ditambah — pesan template WhatsApp resmi.
  type text not null default 'text'
    check (type in ('text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'unsupported', 'template')),
  text_body text,
  media_id text,          -- id media di sisi Meta (dari webhook)
  media_mime_type text,
  -- Ditambah di 0010 — media yang sudah diunduh & disimpan ke Storage.
  media_path text,        -- path di bucket "whatsapp-media"
  media_filename text,    -- nama file asli (untuk dokumen)
  media_status text not null default 'none'
    check (media_status in ('none', 'pending', 'stored', 'failed')),
  status text not null default 'sent'
    check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message text,
  sent_by uuid references profiles(id) on delete set null,
  sent_by_bot boolean not null default false,  -- 0015: dikirim oleh chatbot AI
  raw jsonb,
  -- wa_timestamp (0010): waktu asli dari WhatsApp, buat urutan & jendela 24 jam.
  wa_timestamp timestamptz,
  created_at timestamptz not null default now()
);

alter table messages enable row level security;

create policy "read messages of visible conversations"
  on messages for select
  to authenticated
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
      and (
        c.assigned_to is null
        or c.assigned_to = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
      )
    )
  );

create policy "insert messages into visible conversations"
  on messages for insert
  to authenticated
  with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
      and (
        c.assigned_to is null
        or c.assigned_to = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
      )
    )
  );

create policy "update own outbound messages"
  on messages for update
  to authenticated
  using (sent_by = auth.uid())
  with check (sent_by = auth.uid());

-- 0010: unread_count naik otomatis tiap ada pesan inbound (atomic, anti-balapan).
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

-- 0010: bucket privat untuk media WhatsApp. Upload & baca semua lewat server
-- (service-role, bypass RLS) — tidak perlu policy di storage.objects.
insert into storage.buckets (id, name, public)
  values ('whatsapp-media', 'whatsapp-media', false)
  on conflict (id) do nothing;

-- 0013: template pesan WhatsApp resmi (di-sync dari Meta oleh admin).
create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text not null,
  category text,
  status text,
  body_text text,
  variable_count int not null default 0,
  header_format text,
  components jsonb,
  synced_at timestamptz not null default now(),
  unique (name, language)
);
alter table whatsapp_templates enable row level security;
create policy "authenticated read whatsapp templates"
  on whatsapp_templates for select to authenticated using (true);
-- Penulisan hanya lewat service-role (aksi admin syncTemplates).

-- 0014: quick replies — potongan teks siap pakai untuk balasan inbox.
-- owner_id null = milik bersama (admin), terisi = pribadi milik sales.
create table if not exists quick_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  owner_id uuid references profiles(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table quick_replies enable row level security;
create policy "read shared or own quick replies"
  on quick_replies for select to authenticated
  using (
    owner_id is null
    or owner_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );
create policy "insert own or shared quick replies"
  on quick_replies for insert to authenticated
  with check (
    owner_id = auth.uid()
    or (owner_id is null and exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  );
create policy "update own quick replies, admin any"
  on quick_replies for update to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  )
  with check (
    owner_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );
create policy "delete own quick replies, admin any"
  on quick_replies for delete to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

-- 0015: konfigurasi chatbot AI (satu baris, dikelola admin). Default MATI.
create table if not exists bot_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  system_prompt text not null default '',
  faq text not null default '',
  -- 0017: pesan pembuka verbatim untuk pesan pertama dari sebuah kontak.
  welcome_message text not null default '',
  max_replies_per_conversation int not null default 5,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);
insert into bot_config (id) values (1) on conflict (id) do nothing;
alter table bot_config enable row level security;
create policy "authenticated read bot config"
  on bot_config for select to authenticated using (true);
create policy "admin update bot config"
  on bot_config for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- 0011: indeks trigram untuk pencarian teks pesan & kontak.
create extension if not exists pg_trgm;
create index if not exists messages_text_body_trgm
  on messages using gin (text_body gin_trgm_ops);
create index if not exists conversations_display_name_trgm
  on conversations using gin (display_name gin_trgm_ops);
create index if not exists conversations_external_contact_trgm
  on conversations using gin (external_contact_id gin_trgm_ops);

alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table messages;
