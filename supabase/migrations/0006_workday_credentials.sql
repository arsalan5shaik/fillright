-- Stores the email/password the user wants reused across Workday tenants'
-- own "create a candidate account" steps (separate from their FillRight
-- login and separate from their resume contact email). The password is
-- encrypted at the application layer (same Fernet key as sensitive
-- common-question answers) before it ever reaches this table - only
-- decrypted server-side, on behalf of the authenticated owner.

create table public.workday_credentials (
  user_id             uuid primary key references public.users(id) on delete cascade,
  email               text,
  encrypted_password  text,
  updated_at          timestamptz not null default now()
);

alter table public.workday_credentials enable row level security;

create policy "workday_credentials_select_own" on public.workday_credentials
  for select using (auth.uid() = user_id);
create policy "workday_credentials_insert_own" on public.workday_credentials
  for insert with check (auth.uid() = user_id);
create policy "workday_credentials_update_own" on public.workday_credentials
  for update using (auth.uid() = user_id);
create policy "workday_credentials_delete_own" on public.workday_credentials
  for delete using (auth.uid() = user_id);

-- RLS alone doesn't grant table access (learned the hard way in Milestone 1)
grant select, insert, update, delete on public.workday_credentials to authenticated;

create trigger set_updated_at
  before update on public.workday_credentials
  for each row execute function public.set_updated_at();
