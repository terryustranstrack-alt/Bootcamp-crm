-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Dukungan multi-brand: nomor WhatsApp kedua (WABA sama) untuk brand & tim
-- sales yang berbeda, dengan chatbot & dashboard sendiri-sendiri per brand.
--
-- Backward compatible: semua baris lama di-backfill ke satu brand default
-- (nomor yang sudah jalan sekarang), jadi tidak ada perilaku yang berubah
-- sampai brand kedua benar-benar diisi (lihat README bagian "Brand kedua").

-- 1. Tabel brands + brand default untuk nomor yang sudah ada.
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_number_id text not null unique,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
insert into brands (name, phone_number_id, is_default)
values ('TransTRACK', '1264862936718628', true)
on conflict (phone_number_id) do nothing;

alter table brands enable row level security;
drop policy if exists "authenticated read brands" on brands;
create policy "authenticated read brands"
  on brands for select to authenticated using (true);
drop policy if exists "admin manage brands" on brands;
create policy "admin manage brands"
  on brands for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- 2. brand_id di profiles/leads/conversations, di-backfill ke brand default.
alter table profiles add column if not exists brand_id uuid references brands(id) on delete set null;
update profiles set brand_id = (select id from brands where is_default) where brand_id is null;

alter table leads add column if not exists brand_id uuid references brands(id) on delete set null;
update leads set brand_id = (select id from brands where is_default) where brand_id is null;

alter table conversations add column if not exists brand_id uuid references brands(id) on delete set null;
update conversations set brand_id = (select id from brands where is_default) where brand_id is null;

-- 3. Kontak yang sama menghubungi 2 nomor brand berbeda = 2 percakapan beda.
alter table conversations drop constraint if exists conversations_channel_external_contact_id_key;
alter table conversations add constraint conversations_channel_external_contact_id_brand_id_key
  unique (channel, external_contact_id, brand_id);

-- 4. bot_config: lepas singleton lama (id selalu 1), brand_id jadi primary
--    key beneran — satu baris konfigurasi bot per brand.
alter table bot_config add column if not exists brand_id uuid references brands(id) on delete cascade;
update bot_config set brand_id = (select id from brands where is_default) where brand_id is null;
alter table bot_config alter column brand_id set not null;
alter table bot_config drop constraint bot_config_pkey;
alter table bot_config add constraint bot_config_pkey primary key (brand_id);
alter table bot_config drop constraint if exists bot_config_id_check;
alter table bot_config drop column if exists id;

-- 5. RLS leads: tambah "pool belum diklaim" per-brand (belum ada sebelumnya
--    sama sekali untuk leads) — sekalian menutup celah lead yang dibuat
--    otomatis oleh bot (assigned_to & created_by kosong) supaya kelihatan
--    oleh tim sales brand terkait, bukan cuma admin. Klausa assigned_to/
--    created_by/is_admin yang sudah ada TIDAK diubah.
drop policy if exists "sales read own leads, admin reads all" on leads;
create policy "sales read own leads, admin reads all"
  on leads for select to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = leads.brand_id)
    )
  );

drop policy if exists "sales update own leads, admin updates all" on leads;
create policy "sales update own leads, admin updates all"
  on leads for update to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = leads.brand_id)
    )
  )
  with check (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = leads.brand_id)
    )
  );
-- (policy delete leads sengaja TIDAK diubah — tetap cuma owner/admin.)

-- 6. RLS lead_activities: ikuti kondisi leads yang baru di dalam subquery-nya.
drop policy if exists "read activities of visible leads" on lead_activities;
create policy "read activities of visible leads"
  on lead_activities for select to authenticated
  using (
    exists (
      select 1 from leads l where l.id = lead_activities.lead_id
      and (
        l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
        or (
          l.assigned_to is null and l.brand_id is not null
          and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = l.brand_id)
        )
      )
    )
  );

drop policy if exists "insert activities of visible leads" on lead_activities;
create policy "insert activities of visible leads"
  on lead_activities for insert to authenticated
  with check (
    exists (
      select 1 from leads l where l.id = lead_activities.lead_id
      and (
        l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
        or (
          l.assigned_to is null and l.brand_id is not null
          and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = l.brand_id)
        )
      )
    )
  );

-- 7. RLS conversations: pool "belum diklaim" yang SUDAH ada dipersempit
--    per-brand (dulu: kelihatan oleh SEMUA sales; sekarang: cuma tim sales
--    brand yang sama). Klausa assigned_to = auth.uid() / is_admin tetap sama.
drop policy if exists "read own or unclaimed conversations, admin reads all" on conversations;
create policy "read own or unclaimed conversations, admin reads all"
  on conversations for select to authenticated
  using (
    assigned_to = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = conversations.brand_id)
    )
  );

drop policy if exists "update own or unclaimed conversations, admin updates all" on conversations;
create policy "update own or unclaimed conversations, admin updates all"
  on conversations for update to authenticated
  using (
    assigned_to = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = conversations.brand_id)
    )
  )
  with check (
    assigned_to = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = conversations.brand_id)
    )
  );

-- 8. RLS messages: ikuti kondisi conversations yang baru di dalam subquery.
drop policy if exists "read messages of visible conversations" on messages;
create policy "read messages of visible conversations"
  on messages for select to authenticated
  using (
    exists (
      select 1 from conversations c where c.id = messages.conversation_id
      and (
        c.assigned_to = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
        or (
          c.assigned_to is null and c.brand_id is not null
          and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = c.brand_id)
        )
      )
    )
  );

drop policy if exists "insert messages into visible conversations" on messages;
create policy "insert messages into visible conversations"
  on messages for insert to authenticated
  with check (
    exists (
      select 1 from conversations c where c.id = messages.conversation_id
      and (
        c.assigned_to = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
        or (
          c.assigned_to is null and c.brand_id is not null
          and exists (select 1 from profiles p where p.id = auth.uid() and p.brand_id = c.brand_id)
        )
      )
    )
  );
