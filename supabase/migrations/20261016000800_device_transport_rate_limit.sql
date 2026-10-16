-- Bound work initiated through long-lived device credentials. One row per
-- enrolled device keeps the limiter durable and its storage bounded.
create table if not exists public.hey_device_transport_rate_limits (
  device_id uuid primary key references public.hey_devices(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 120)
);
alter table public.hey_device_transport_rate_limits enable row level security;
revoke all on public.hey_device_transport_rate_limits from public, anon, authenticated, service_role;

create or replace function public.consume_hey_device_transport_rate_limit(
  p_device_id uuid, p_secret_hash text
) returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_device public.hey_devices%rowtype;
  v_credential public.hey_device_credentials%rowtype;
  v_now timestamptz := clock_timestamp();
  v_allowed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device credential service required.' using errcode = '42501';
  end if;
  if p_device_id is null or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device transport rate-limit request.' using errcode = '22023';
  end if;

  -- Follow the same device -> credential lock order as credential rotation
  -- and every queue mutation, so revocation cannot race a limiter decision.
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.status in ('online', 'offline') for update;
  if not found then return false; end if;
  select * into v_credential from public.hey_device_credentials c
    where c.device_id = p_device_id and c.account_id = v_device.user_id
      and c.secret_hash = p_secret_hash and c.revoked_at is null for update;
  if not found then return false; end if;

  insert into public.hey_device_transport_rate_limits(device_id, window_started_at, request_count)
    values (p_device_id, v_now, 1)
  on conflict (device_id) do update set
    window_started_at = case
      when public.hey_device_transport_rate_limits.window_started_at <= v_now - interval '1 minute' then v_now
      else public.hey_device_transport_rate_limits.window_started_at
    end,
    request_count = case
      when public.hey_device_transport_rate_limits.window_started_at <= v_now - interval '1 minute' then 1
      else public.hey_device_transport_rate_limits.request_count + 1
    end
  where public.hey_device_transport_rate_limits.window_started_at <= v_now - interval '1 minute'
    or public.hey_device_transport_rate_limits.request_count < 120
  returning true into v_allowed;
  return coalesce(v_allowed, false);
end;
$$;

revoke all on function public.consume_hey_device_transport_rate_limit(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_hey_device_transport_rate_limit(uuid, text) to service_role;
