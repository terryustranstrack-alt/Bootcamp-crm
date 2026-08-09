-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Membatasi akses lead: sales cuma boleh baca/ubah/hapus lead yang
-- assigned_to ATAU created_by mereka sendiri. Admin (profiles.is_admin)
-- tetap bisa akses semua lead. lead_activities mengikuti visibilitas
-- lead terkait.

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

drop policy if exists "authenticated can read leads" on leads;
drop policy if exists "authenticated can update leads" on leads;
drop policy if exists "authenticated can delete leads" on leads;

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

drop policy if exists "authenticated can read lead activities" on lead_activities;
drop policy if exists "authenticated can insert lead activities" on lead_activities;

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
