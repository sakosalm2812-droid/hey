-- A retry after a lost claim response must replay the same active lease. The
-- receipt count is bounded by each command's five-attempt delivery limit and
-- receipts cascade away with their command.
create table public.hey_device_command_claim_receipts (
  account_id uuid not null,
  device_id uuid not null,
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 128 and idempotency_key !~ '[[:cntrl:]]'),
  command_id uuid not null,
  lease_token uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (account_id, device_id, idempotency_key),
  unique (command_id, lease_token),
  foreign key (command_id, account_id, device_id)
    references public.hey_device_commands(id, account_id, device_id) on delete cascade,
  foreign key (device_id, account_id)
    references public.hey_devices(id, user_id) on delete cascade
);
alter table public.hey_device_command_claim_receipts enable row level security;
revoke all on public.hey_device_command_claim_receipts from public, anon, authenticated, service_role;

-- The credential-fenced overload serializes claims on the device row, checks
-- the same active credential as every other transport mutation, then either
-- replays an active claim or makes one new claim through the private legacy
-- routine. Expired/revoked receipts return no command; the same key cannot
-- silently lease a different command.
create or replace function public.claim_hey_device_command(
  p_account_id uuid, p_device_id uuid, p_idempotency_key text,
  p_lease_ms integer, p_credential_hash text
) returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_device public.hey_devices%rowtype;
  v_credential public.hey_device_credentials%rowtype;
  v_receipt public.hey_device_command_claim_receipts%rowtype;
  v_command public.hey_device_commands%rowtype;
  v_claim jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Trusted device command service required.' using errcode = '42501'; end if;
  if p_account_id is null or p_device_id is null
    or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 128
    or p_idempotency_key ~ '[[:cntrl:]]' or p_lease_ms is null or p_lease_ms not between 1 and 300000
    or p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device command lease.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id and d.status in ('online', 'offline') for update;
  if not found then return null; end if;
  select * into v_credential from public.hey_device_credentials c
    where c.account_id = p_account_id and c.device_id = p_device_id
      and c.secret_hash = p_credential_hash and c.revoked_at is null for update;
  if not found then return null; end if;

  select * into v_receipt from public.hey_device_command_claim_receipts r
    where r.account_id = p_account_id and r.device_id = p_device_id
      and r.idempotency_key = trim(p_idempotency_key);
  if found then
    select * into v_command from public.hey_device_commands c
      where c.id = v_receipt.command_id and c.account_id = p_account_id and c.device_id = p_device_id
        and c.state = 'pending' and c.lease_token = v_receipt.lease_token
        and c.lease_until > clock_timestamp()
        and public.hey_device_command_mandate_is_current(c.account_id, c.mandate_ids, c.mandate_expires_at, c.mandate_revocation_epoch)
        and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id
          and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
        and v_device.capabilities @> jsonb_build_array(c.envelope->>'action');
    if not found then return null; end if;
    return jsonb_build_object('command', jsonb_build_object(
      'commandId', v_command.id, 'deviceId', v_command.device_id, 'envelope', v_command.envelope,
      'state', v_command.state, 'attempts', v_command.attempts, 'createdAt', v_command.created_at,
      'lastError', v_command.last_error
    ), 'leaseToken', v_command.lease_token);
  end if;

  v_claim := public.claim_hey_device_command(p_account_id, p_device_id, p_lease_ms);
  if v_claim is null then return null; end if;
  insert into public.hey_device_command_claim_receipts(account_id, device_id, idempotency_key, command_id, lease_token)
    values (p_account_id, p_device_id, trim(p_idempotency_key), (v_claim->'command'->>'commandId')::uuid, (v_claim->>'leaseToken')::uuid);
  return v_claim;
end;
$$;

-- Keep the older credential wrapper private; only the new idempotent form is
-- callable by the trusted Edge service.
revoke all on function public.claim_hey_device_command(uuid, uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.claim_hey_device_command(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.claim_hey_device_command(uuid, uuid, text, integer, text) to service_role;
