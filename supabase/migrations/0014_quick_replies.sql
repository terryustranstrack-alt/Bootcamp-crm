-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- "Quick replies" — potongan teks siap pakai yang bisa disisipkan ke kotak
-- balasan inbox dengan sekali klik. owner_id null = milik bersama (dikelola
-- admin); owner_id terisi = pribadi milik sales itu.

create table if not exists quick_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  owner_id uuid references profiles(id) on delete cascade,  -- null = shared
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table quick_replies enable row level security;

drop policy if exists "read shared or own quick replies" on quick_replies;
create policy "read shared or own quick replies"
  on quick_replies for select
  to authenticated
  using (
    owner_id is null
    or owner_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "insert own or shared quick replies" on quick_replies;
create policy "insert own or shared quick replies"
  on quick_replies for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    or (owner_id is null and exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  );

drop policy if exists "update own quick replies, admin any" on quick_replies;
create policy "update own quick replies, admin any"
  on quick_replies for update
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  )
  with check (
    owner_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "delete own quick replies, admin any" on quick_replies;
create policy "delete own quick replies, admin any"
  on quick_replies for delete
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );
