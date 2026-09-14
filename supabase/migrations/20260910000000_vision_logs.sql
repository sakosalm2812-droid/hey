-- HEY Vision log table.
-- Records every verified vision analysis the user requested,
-- keeping the observation auditable and attributable to the user.

create table if not exists public.hey_vision_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text,
  prompt text,
  observation jsonb,
  model text,
  provider text,
  created_at timestamptz not null default now()
);

alter table public.hey_vision_logs enable row level security;

drop policy if exists "Users see own vision logs" on public.hey_vision_logs;
create policy "Users see own vision logs" on public.hey_vision_logs
  for select using (auth.uid() = user_id);

drop policy if exists "Users insert own vision logs" on public.hey_vision_logs;
create policy "Users insert own vision logs" on public.hey_vision_logs
  for insert with check (auth.uid() = user_id);

create index if not exists hey_vision_logs_user_idx on public.hey_vision_logs(user_id, created_at desc);