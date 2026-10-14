-- Durable, server-only event outbox with unique idempotency, atomic claims,
-- bounded leases, and fencing tokens. Event errors are stored only as a generic
-- code; raw exception messages may contain private event or account data.

create table if not exists public.hey_event_outbox (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (length(trim(scope)) between 1 and 512),
  event_name text not null check (length(trim(event_name)) between 1 and 512),
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 512),
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending', 'delivered')),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  unique (scope, event_name, idempotency_key),
  check ((lease_token is null) = (lease_until is null)),
  check (last_error is null or last_error = 'delivery_failed')
);

create index if not exists hey_event_outbox_pending_created_idx
  on public.hey_event_outbox (created_at, id) where state = 'pending';

alter table public.hey_event_outbox enable row level security;
revoke all on public.hey_event_outbox from public, anon, authenticated;

grant select, insert, update, delete on public.hey_event_outbox to service_role;

create or replace function public.append_hey_event_outbox_once(
  p_idempotency_key text, p_event_name text, p_payload jsonb, p_scope text
) returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_event public.hey_event_outbox%rowtype;
  v_created boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Privileged event outbox operation.' using errcode = '42501';
  end if;
  if p_scope is null or length(trim(p_scope)) not between 1 and 512
    or p_event_name is null or length(trim(p_event_name)) not between 1 and 512
    or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 512
    or p_payload is null then
    raise exception 'Invalid event outbox input.' using errcode = '22023';
  end if;
  insert into public.hey_event_outbox(scope, event_name, idempotency_key, payload)
    values (trim(p_scope), trim(p_event_name), trim(p_idempotency_key), p_payload)
    on conflict (scope, event_name, idempotency_key) do nothing
    returning * into v_event;
  if found then
    v_created := true;
  else
    select * into v_event from public.hey_event_outbox
      where scope = trim(p_scope) and event_name = trim(p_event_name)
        and idempotency_key = trim(p_idempotency_key)
      for update;
    if not found then raise exception 'Outbox event unavailable.' using errcode = '40001'; end if;
    if v_event.payload is distinct from p_payload then
      raise exception 'Idempotency key payload conflict.' using errcode = '23505';
    end if;
  end if;
  return jsonb_build_object('created', v_created, 'event', jsonb_build_object(
    'id', v_event.id, 'idempotencyKey', v_event.idempotency_key,
    'scope', v_event.scope, 'eventName', v_event.event_name, 'payload', v_event.payload,
    'state', v_event.state, 'attempts', v_event.attempts, 'createdAt', v_event.created_at,
    'deliveredAt', v_event.delivered_at, 'lastError', v_event.last_error
  ));
end;
$$;

create or replace function public.claim_hey_event_outbox(p_event_id uuid, p_lease_ms integer)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_event public.hey_event_outbox%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Privileged event outbox operation.' using errcode = '42501';
  end if;
  if p_lease_ms is null or p_lease_ms not between 1 and 300000 then
    raise exception 'Invalid event lease.' using errcode = '22023';
  end if;
  update public.hey_event_outbox
    set lease_token = gen_random_uuid(),
        lease_until = clock_timestamp() + (p_lease_ms * interval '1 millisecond'),
        attempts = attempts + 1
    where id = p_event_id and state = 'pending'
      and (lease_until is null or lease_until <= clock_timestamp())
    returning * into v_event;
  if not found then return null; end if;
  return jsonb_build_object('event', jsonb_build_object(
    'id', v_event.id, 'idempotencyKey', v_event.idempotency_key,
    'scope', v_event.scope, 'eventName', v_event.event_name, 'payload', v_event.payload,
    'state', v_event.state, 'attempts', v_event.attempts, 'createdAt', v_event.created_at,
    'deliveredAt', v_event.delivered_at, 'lastError', v_event.last_error
  ), 'leaseToken', v_event.lease_token);
end;
$$;

create or replace function public.list_hey_event_outbox_pending(p_limit integer default 100)
returns setof jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Privileged event outbox operation.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'Invalid outbox page size.' using errcode = '22023';
  end if;
  return query select jsonb_build_object(
    'id', e.id, 'idempotencyKey', e.idempotency_key, 'scope', e.scope,
    'eventName', e.event_name, 'payload', e.payload, 'state', e.state,
    'attempts', e.attempts, 'createdAt', e.created_at,
    'deliveredAt', e.delivered_at, 'lastError', e.last_error
  ) from public.hey_event_outbox e where e.state = 'pending'
  order by e.created_at, e.id limit p_limit;
end;
$$;

create or replace function public.ack_hey_event_outbox(p_event_id uuid, p_lease_token uuid)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Privileged event outbox operation.' using errcode = '42501';
  end if;
  update public.hey_event_outbox
    set state = 'delivered', delivered_at = clock_timestamp(),
        lease_token = null, lease_until = null, last_error = null
    where id = p_event_id and state = 'pending' and lease_token = p_lease_token
      and lease_until > clock_timestamp();
  return found;
end;
$$;

create or replace function public.release_hey_event_outbox(p_event_id uuid, p_lease_token uuid)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Privileged event outbox operation.' using errcode = '42501';
  end if;
  update public.hey_event_outbox
    set lease_token = null, lease_until = null, last_error = 'delivery_failed'
    where id = p_event_id and state = 'pending' and lease_token = p_lease_token
      and lease_until > clock_timestamp();
  return found;
end;
$$;

revoke all on function public.append_hey_event_outbox_once(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.claim_hey_event_outbox(uuid, integer) from public, anon, authenticated;
revoke all on function public.list_hey_event_outbox_pending(integer) from public, anon, authenticated;
revoke all on function public.ack_hey_event_outbox(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_hey_event_outbox(uuid, uuid) from public, anon, authenticated;
grant execute on function public.append_hey_event_outbox_once(text, text, jsonb, text) to service_role;
grant execute on function public.claim_hey_event_outbox(uuid, integer) to service_role;
grant execute on function public.list_hey_event_outbox_pending(integer) to service_role;
grant execute on function public.ack_hey_event_outbox(uuid, uuid) to service_role;
grant execute on function public.release_hey_event_outbox(uuid, uuid) to service_role;
