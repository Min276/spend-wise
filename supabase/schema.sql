-- Spendwise v2 backend: one end-to-end-encrypted blob per user.
-- The server only ever stores ciphertext; the AES-GCM key never leaves the browser.
-- Run in Supabase → SQL Editor, or `supabase db push` once the project is linked.

create table if not exists public.app_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  ciphertext text        not null,
  version    integer     not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;

-- Each user may touch only their own row; auth.uid() is the caller's id from their JWT.
create policy "app_data owner read"   on public.app_data for select using (auth.uid() = user_id);
create policy "app_data owner insert" on public.app_data for insert with check (auth.uid() = user_id);
create policy "app_data owner update" on public.app_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "app_data owner delete" on public.app_data for delete using (auth.uid() = user_id);
