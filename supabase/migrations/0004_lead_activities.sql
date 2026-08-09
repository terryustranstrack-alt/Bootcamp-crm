-- Jalankan file ini di Supabase Dashboard > SQL Editor setelah Fase 2.
-- Menambahkan riwayat aktivitas per lead (ganti perubahan status & catatan
-- dari field teks tunggal menjadi log terstruktur, append-only).

create table if not exists lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  type text not null check (type in ('status_change', 'note')),
  content text,
  old_status text,
  new_status text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table lead_activities enable row level security;

-- Append-only: hanya select & insert, tidak ada update/delete.
create policy "authenticated can read lead activities"
  on lead_activities for select
  to authenticated
  using (true);

create policy "authenticated can insert lead activities"
  on lead_activities for insert
  to authenticated
  with check (true);
