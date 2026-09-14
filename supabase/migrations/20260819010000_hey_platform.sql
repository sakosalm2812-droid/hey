create table if not exists public.hey_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  scope text not null default 'account',
  status text not null default 'revoked' check (status in ('granted', 'revoked', 'pending')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, permission, scope)
);

create table if not exists public.hey_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  name text not null,
  status text not null default 'offline' check (status in ('online', 'offline', 'pending', 'revoked')),
  capabilities jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hey_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  trigger_config jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  status text not null default 'paused' check (status in ('active', 'paused', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hey_proactive_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  reason text not null default '',
  status text not null default 'new' check (status in ('new', 'snoozed', 'dismissed', 'accepted', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  snoozed_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.hey_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  tool text,
  risk_level text not null default 'low',
  status text not null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hey_permissions_user_idx on public.hey_permissions(user_id, status);
create index if not exists hey_devices_user_idx on public.hey_devices(user_id, status);
create index if not exists hey_routines_user_idx on public.hey_routines(user_id, status);
create index if not exists hey_suggestions_user_idx on public.hey_proactive_suggestions(user_id, status, created_at desc);
create index if not exists hey_audit_user_idx on public.hey_audit_log(user_id, created_at desc);

alter table public.hey_permissions enable row level security;
alter table public.hey_devices enable row level security;
alter table public.hey_routines enable row level security;
alter table public.hey_proactive_suggestions enable row level security;
alter table public.hey_audit_log enable row level security;

drop policy if exists "Users manage their permissions" on public.hey_permissions;
create policy "Users manage their permissions" on public.hey_permissions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their devices" on public.hey_devices;
create policy "Users manage their devices" on public.hey_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their routines" on public.hey_routines;
create policy "Users manage their routines" on public.hey_routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their suggestions" on public.hey_proactive_suggestions;
create policy "Users manage their suggestions" on public.hey_proactive_suggestions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users view their audit log" on public.hey_audit_log;
create policy "Users view their audit log" on public.hey_audit_log
  for select using (auth.uid() = user_id);
