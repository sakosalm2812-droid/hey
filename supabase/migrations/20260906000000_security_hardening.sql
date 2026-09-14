-- HEY release security hardening
-- Account tiers and entitlements are billing-server state. They must never be
-- taken from signup metadata or be writable by a browser session.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, plan, entitlements)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), new.email),
    'free',
    '[]'::jsonb
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.protect_profile_account_state()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role'
    and (
      new.plan is distinct from old.plan
      or new.entitlements is distinct from old.entitlements
    ) then
    raise exception 'Account plan and entitlements are managed by the billing service.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_account_state on public.profiles;
create trigger protect_profile_account_state
  before update on public.profiles
  for each row execute function public.protect_profile_account_state();

drop policy if exists "Users manage their profile" on public.profiles;
drop policy if exists "Users view their profile" on public.profiles;
drop policy if exists "Users update their profile" on public.profiles;
create policy "Users view their profile"
  on public.profiles for select
  using (auth.uid() = id);
create policy "Users update their profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- A message must always belong to the same account as its conversation. RLS
-- alone checks user_id but cannot enforce this relationship across tables.
create or replace function public.enforce_message_conversation_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.hey_conversations
    where id = new.conversation_id
      and user_id = new.user_id
  ) then
    raise exception 'Conversation ownership does not match message ownership.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_message_conversation_owner on public.hey_messages;
create trigger enforce_message_conversation_owner
  before insert or update on public.hey_messages
  for each row execute function public.enforce_message_conversation_owner();

-- Memory graph edges cannot join nodes from different accounts.
create or replace function public.enforce_memory_edge_owners()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.hey_memory_nodes
    where id = new.from_node and user_id = new.user_id
  ) or not exists (
    select 1 from public.hey_memory_nodes
    where id = new.to_node and user_id = new.user_id
  ) then
    raise exception 'Memory graph nodes must belong to the same account as the edge.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_memory_edge_owners on public.hey_memory_edges;
create trigger enforce_memory_edge_owners
  before insert or update on public.hey_memory_edges
  for each row execute function public.enforce_memory_edge_owners();

-- Permission choices are user-owned consent records. They never grant a plan
-- entitlement: the execution boundary separately verifies account tier,
-- permission and confirmation before running a tool.
drop policy if exists "Users manage their permissions" on public.hey_permissions;
drop policy if exists "Users view their permissions" on public.hey_permissions;
create policy "Users manage their permissions"
  on public.hey_permissions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
