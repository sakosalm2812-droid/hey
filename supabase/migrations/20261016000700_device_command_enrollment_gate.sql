-- Device commands may be queued for enrolled devices while they are online or
-- offline. Pending enrollment must not authorize enqueue or retain queued work.
create or replace function public.guard_hey_device_command_enrollment()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device command service required.' using errcode = '42501';
  end if;
  select d.status into v_status from public.hey_devices d
    where d.id = new.device_id and d.user_id = new.account_id;
  if v_status is distinct from 'online' and v_status is distinct from 'offline' then
    raise exception 'Device enrollment is not complete.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_hey_device_command_enrollment() from public, anon, authenticated;
drop trigger if exists hey_device_commands_require_enrolled_device on public.hey_device_commands;
create trigger hey_device_commands_require_enrolled_device
  before insert on public.hey_device_commands
  for each row execute function public.guard_hey_device_command_enrollment();

create or replace function public.cancel_hey_device_commands_on_enrollment_change()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.status is distinct from old.status and new.status not in ('online', 'offline') then
    update public.hey_device_commands c
      set state = 'cancelled', lease_token = null, lease_until = null
      where c.account_id = new.user_id and c.device_id = new.id and c.state = 'pending';
  end if;
  return new;
end;
$$;

revoke all on function public.cancel_hey_device_commands_on_enrollment_change() from public, anon, authenticated;
drop trigger if exists hey_devices_cancel_commands_on_enrollment_change on public.hey_devices;
create trigger hey_devices_cancel_commands_on_enrollment_change
  after update of status on public.hey_devices
  for each row execute function public.cancel_hey_device_commands_on_enrollment_change();
