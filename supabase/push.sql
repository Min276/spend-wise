-- Spendwise push notifications: one row per subscribed device.
-- Holds only the push endpoint/keys, the device timezone and the reminder
-- schedule — never any ledger data. Run in Supabase → SQL Editor after
-- deploying api/push-tick.ts to Vercel and setting its env vars.

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  tz         text not null default 'Asia/Bangkok',
  reminders  jsonb not null default '{}'::jsonb,   -- { morningBrief: { enabled, time }, ... }
  sent       jsonb not null default '{}'::jsonb,   -- { morningBrief: 'YYYY-MM-DD', ... } dedup per day
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Each signed-in user manages only their own devices; the tick uses the service role (bypasses RLS).
create policy "push owner read"   on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "push owner insert" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push owner update" on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push owner delete" on public.push_subscriptions for delete using (auth.uid() = user_id);

-- Every 5 minutes, ask the Vercel function to deliver whatever is due.
-- Replace the URL with your deployment and <PUSH_TICK_SECRET> with the same
-- value you set in Vercel. (Enable pg_cron + pg_net under Database → Extensions
-- first if the `create extension` lines fail.)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('spendwise-push-tick') where exists (select 1 from cron.job where jobname = 'spendwise-push-tick');
select cron.schedule(
  'spendwise-push-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://spend-wise.vercel.app/api/push-tick',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <PUSH_TICK_SECRET>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
