-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Chat WhatsApp (Cloud API resmi) terintegrasi ke CRM. "channel" dibuat
-- extensible (bukan cuma constant 'whatsapp') supaya channel lain bisa
-- ditambah nanti tanpa redesign skema.
--
-- conversations.assigned_to null = belum diklaim, terlihat oleh semua
-- sales/admin (pool). Begitu diklaim atau otomatis ke-link ke lead,
-- visibilitasnya jadi silo per-sales sama seperti tabel leads (0007).

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

-- Meliputi klaim conversation (assigned_to null -> auth.uid()) dan
-- link/unlink ke lead. Insert dilakukan lewat service-role client di
-- webhook route (bypass RLS), jadi tidak butuh policy insert di sini.
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
  type text not null default 'text'
    check (type in ('text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'unsupported')),
  text_body text,
  media_id text,
  media_mime_type text,
  status text not null default 'sent'
    check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message text,
  sent_by uuid references profiles(id) on delete set null,
  raw jsonb,
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

-- Untuk outbound: insert lewat server client (respect RLS) supaya cuma
-- sales/admin yang berhak akses conversation itu yang bisa kirim.
-- Inbound (dari webhook) pakai service-role client, bypass policy ini.
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

-- Sender update status pesan outbound miliknya sendiri (pending -> sent,
-- + wa_message_id) setelah panggilan WhatsApp API sukses/gagal. Update
-- status delivered/read dari webhook statuses[] tetap lewat service-role
-- client di webhook route (message itu bukan milik siapa-siapa/sent_by
-- null untuk inbound).
create policy "update own outbound messages"
  on messages for update
  to authenticated
  using (sent_by = auth.uid())
  with check (sent_by = auth.uid());

-- Supaya inbox bisa subscribe postgres_changes (pesan masuk dari webhook
-- tidak punya trigger mutation di sisi client seperti fitur lain di app ini).
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table messages;
