-- Only devices in registry states understood by the trusted device flow may
-- receive or use a transport credential. In particular, pending is not trusted.
create or replace function public.rotate_hey_device_credential(p_account_id uuid, p_device_id uuid, p_secret_hash text)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_device public.hey_devices%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device credential service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device credential.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id and d.status in ('online', 'offline')
    for update;
  if not found then return false; end if;
  insert into public.hey_device_credentials(account_id, device_id, secret_hash, revoked_at)
    values (p_account_id, p_device_id, p_secret_hash, null)
  on conflict (device_id) do update set secret_hash = excluded.secret_hash, created_at = clock_timestamp(), revoked_at = null
    where public.hey_device_credentials.account_id = excluded.account_id;
  return found;
end;
$$;

create or replace function public.authenticate_hey_device_credential(p_secret_hash text)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_identity jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device credential service required.' using errcode = '42501';
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object('accountId', c.account_id, 'deviceId', c.device_id, 'active', true) into v_identity
    from public.hey_device_credentials c join public.hey_devices d on d.id = c.device_id and d.user_id = c.account_id
    where c.secret_hash = p_secret_hash and c.revoked_at is null and d.status in ('online', 'offline');
  return v_identity;
end;
$$;

revoke all on function public.rotate_hey_device_credential(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.authenticate_hey_device_credential(text) from public, anon, authenticated;
grant execute on function public.rotate_hey_device_credential(uuid, uuid, text) to service_role;
grant execute on function public.authenticate_hey_device_credential(text) to service_role;
