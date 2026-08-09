-- Jalankan file ini di Supabase Dashboard > SQL Editor setelah Fase 5.
-- Menambahkan tabel profiles (representasi ringan dari auth.users, karena
-- tabel auth.users sendiri tidak bisa langsung di-query dari client) dan
-- kolom assigned_to di leads untuk fitur assignment ke sales tertentu.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "authenticated can read profiles"
  on profiles for select
  to authenticated
  using (true);

-- Auto-isi profiles setiap ada user baru dibuat (lewat Supabase Dashboard).
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

-- Backfill profiles untuk user yang sudah ada sebelum trigger ini dibuat.
insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data ->> 'full_name'
from auth.users
on conflict (id) do nothing;

alter table leads add column if not exists assigned_to uuid references profiles(id);
