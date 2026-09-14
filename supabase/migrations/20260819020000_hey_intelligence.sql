create table if not exists public.hey_memory_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_key text not null,
  value text not null,
  node_type text not null default 'memory',
  confidence numeric not null default 0.7 check (confidence >= 0 and confidence <= 1),
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, node_key)
);

create table if not exists public.hey_memory_edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_node uuid not null references public.hey_memory_nodes(id) on delete cascade,
  to_node uuid not null references public.hey_memory_nodes(id) on delete cascade,
  relation text not null default 'related',
  weight numeric not null default 0.6 check (weight >= 0 and weight <= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, from_node, to_node, relation)
);

create table if not exists public.hey_action_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_key text not null,
  title text not null,
  tool text,
  risk_level text not null default 'medium',
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  undo jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hey_quality_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.hey_conversations(id) on delete set null,
  score integer not null check (score >= 0 and score <= 100),
  checks jsonb not null default '{}'::jsonb,
  needs_revision boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.hey_forge_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief text not null,
  artifact jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  status text not null default 'needs_review',
  created_at timestamptz not null default now()
);

create index if not exists hey_memory_nodes_user_idx on public.hey_memory_nodes(user_id, updated_at desc);
create index if not exists hey_memory_edges_user_idx on public.hey_memory_edges(user_id, created_at desc);
create index if not exists hey_action_runs_user_idx on public.hey_action_runs(user_id, created_at desc);
create index if not exists hey_quality_reports_user_idx on public.hey_quality_reports(user_id, created_at desc);
create index if not exists hey_forge_runs_user_idx on public.hey_forge_runs(user_id, created_at desc);

alter table public.hey_memory_nodes enable row level security;
alter table public.hey_memory_edges enable row level security;
alter table public.hey_action_runs enable row level security;
alter table public.hey_quality_reports enable row level security;
alter table public.hey_forge_runs enable row level security;

drop policy if exists "Users manage memory nodes" on public.hey_memory_nodes;
create policy "Users manage memory nodes" on public.hey_memory_nodes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage memory edges" on public.hey_memory_edges;
create policy "Users manage memory edges" on public.hey_memory_edges for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage action runs" on public.hey_action_runs;
create policy "Users manage action runs" on public.hey_action_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users view quality reports" on public.hey_quality_reports;
create policy "Users view quality reports" on public.hey_quality_reports for select using (auth.uid() = user_id);
drop policy if exists "Users manage forge runs" on public.hey_forge_runs;
create policy "Users manage forge runs" on public.hey_forge_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
