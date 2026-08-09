-- Jalankan file ini di Supabase Dashboard > SQL Editor setelah Fase 1.
-- Menambahkan fitur hapus lead: user authenticated boleh delete row leads.

create policy "authenticated can delete leads"
  on leads for delete
  to authenticated
  using (true);
