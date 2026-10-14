-- Account-scoped durable invalidation state for signed evidence envelopes.

create table if not exists public.hey_evidence_invalidations (
  account_id uuid not null references auth.users(id) on delete cascade,
  evidence_id uuid not null,
  reason text not null check (reason ~ '^[A-Za-z0-9_.-]{1,64}$'),
  invalidated_at timestamptz not null default now(),
  primary key (account_id, evidence_id)
);

alter table public.hey_evidence_invalidations enable row level security;
revoke all on public.hey_evidence_invalidations from public, anon, authenticated;

create or replace function public.is_hey_evidence_invalidated(p_account_id uuid, p_evidence_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is distinct from p_account_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authenticated account does not own evidence state.' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.hey_evidence_invalidations
    where account_id = p_account_id and evidence_id = p_evidence_id
  );
end;
$$;

create or replace function public.invalidate_hey_evidence(p_account_id uuid, p_evidence_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is distinct from p_account_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authenticated account does not own evidence state.' using errcode = '42501';
  end if;
  if p_reason is null or length(p_reason) > 64 or p_reason !~ '^[A-Za-z0-9_.-]{1,64}$' then
    raise exception 'Evidence invalidation reason must be a bounded machine-safe code.' using errcode = '22023';
  end if;
  insert into public.hey_evidence_invalidations (account_id, evidence_id, reason)
  values (p_account_id, p_evidence_id, p_reason)
  on conflict (account_id, evidence_id) do nothing;
  return true;
end;
$$;

revoke all on function public.is_hey_evidence_invalidated(uuid, uuid) from public, anon;
revoke all on function public.invalidate_hey_evidence(uuid, uuid, text) from public, anon;
grant execute on function public.is_hey_evidence_invalidated(uuid, uuid) to authenticated, service_role;
grant execute on function public.invalidate_hey_evidence(uuid, uuid, text) to authenticated, service_role;
