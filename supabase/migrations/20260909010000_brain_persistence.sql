-- HEY brain persistence: durable audit log and idempotent action runs.

-- Audit entries are consent-aware records of what the assistant did and why.
-- They are owned by the account and never shared with other accounts.
create table if not exists public.hey_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  tool text,
  risk_level text not null default 'low',
  status text not null default 'completed',
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hey_audit_user_idx
  on public.hey_audit(user_id, created_at desc);

alter table public.hey_audit enable row level security;

drop policy if exists "Users view their audit entries" on public.hey_audit;
create policy "Users view their audit entries"
  on public.hey_audit for select
  using (auth.uid() = user_id);

drop policy if exists "Users create their audit entries" on public.hey_audit;
create policy "Users create their audit entries"
  on public.hey_audit for insert
  with check (auth.uid() = user_id);

-- Action runs may be updated in place as a run progresses (queued -> running ->
-- completed/failed/undone). A user-scoped unique action_key makes the sync
-- idempotent. Existing duplicates are removed first so the constraint can apply.
delete from public.hey_action_runs a
using public.hey_action_runs b
where a.user_id = b.user_id
  and a.action_key = b.action_key
  and a.created_at > b.created_at;

create unique index if not exists hey_action_runs_user_key_idx
  on public.hey_action_runs(user_id, action_key);