-- Keep lease renewal from bypassing the one-second claim floor and burning
-- delivery attempts through millisecond renew/expire loops. The latest
-- credential-fenced RPC remains the only service-role entry point.
create or replace function public.renew_hey_device_command_lease(
  p_account_id uuid, p_device_id uuid, p_command_id uuid, p_lease_token uuid,
  p_idempotency_key text, p_lease_ms integer, p_credential_hash text
) returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_device public.hey_devices%rowtype;
  v_credential public.hey_device_credentials%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device command service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null or p_command_id is null or p_lease_token is null
    or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 128
    or p_idempotency_key ~ '[[:cntrl:]]' or p_lease_ms is null or p_lease_ms not between 1000 and 300000
    or p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device command lease renewal.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id and d.status in ('online', 'offline') for update;
  if not found then return jsonb_build_object('renewed', false); end if;
  select * into v_credential from public.hey_device_credentials c
    where c.account_id = p_account_id and c.device_id = p_device_id
      and c.secret_hash = p_credential_hash and c.revoked_at is null for update;
  if not found then return jsonb_build_object('renewed', false); end if;
  return public.renew_hey_device_command_lease(
    p_account_id, p_device_id, p_command_id, p_lease_token, p_idempotency_key, p_lease_ms
  );
end;
$$;

revoke all on function public.renew_hey_device_command_lease(uuid, uuid, uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.renew_hey_device_command_lease(uuid, uuid, uuid, uuid, text, integer, text) to service_role;
