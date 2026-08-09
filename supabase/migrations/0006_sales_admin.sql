-- Jalankan file ini di Supabase Dashboard > SQL Editor setelah fitur "Data Sales".
-- Menambahkan kolom admin & no telp di profiles, dan memastikan lead yang
-- sales-nya dihapus jadi "Belum ditugaskan" (bukan ikut terhapus).

alter table profiles add column if not exists phone text;
alter table profiles add column if not exists is_admin boolean not null default false;

-- Sesuaikan email ini kalau admin utama bukan admin@transtrack.id.
update profiles set is_admin = true where email = 'admin@transtrack.id';

alter table leads drop constraint if exists leads_assigned_to_fkey;
alter table leads
  add constraint leads_assigned_to_fkey
  foreign key (assigned_to) references profiles(id) on delete set null;
