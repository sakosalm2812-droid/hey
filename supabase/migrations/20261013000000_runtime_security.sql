-- Runtime security and shared request controls for HEY.
-- User JWTs can read history and submit user turns only. The edge function
-- persists assistant turns through the Supabase service role after validating
-- the caller, preventing prompt-role injection through direct PostgREST writes.

drop policy if exists "Users manage their messages" on public.hey_messages;
drop policy if exists "Users view their messages" on public.hey_messages;
drop policy if exists "Users insert their messages" on public.hey_messages;
drop policy if exists "Users read their messages" on public.hey_messages;

create policy "Users read their messages"
  on public.hey_messages for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.hey_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "Users insert their messages"
  on public.hey_messages for insert
  with check (
    auth.uid() = user_id
    and role = 'user'
    and exists (
      select 1
      from public.hey_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- No authenticated UPDATE or DELETE policy is created. Service-role edge
-- writes still pass through the conversation-ownership trigger.

create table if not exists public.hey_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  request_times timestamptz[] not null default '{}'::timestamptz[],
  updated_at timestamptz not null default now()
);

alter table public.hey_rate_limits enable row level security;
revoke all on public.hey_rate_limits from anon, authenticated;

create or replace function public.consume_hey_rate_limit()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_recent timestamptz[];
begin
  if v_user_id is null then
    raise exception 'Authenticated identity required.' using errcode = '42501';
  end if;

  insert into public.hey_rate_limits (user_id, request_times, updated_at)
  values (v_user_id, '{}'::timestamptz[], v_now)
  on conflict (user_id) do nothing;

  select coalesce(array_agg(t), '{}'::timestamptz[])
    into v_recent
    from public.hey_rate_limits r,
         lateral unnest(r.request_times) as t
   where r.user_id = v_user_id
     and t > v_now - interval '60 seconds'
   for update;

  -- Serialize on the user's row before deciding the request outcome.
  perform 1 from public.hey_rate_limits
   where user_id = v_user_id
   for update;

  select coalesce(array_agg(t), '{}'::timestamptz[])
    into v_recent
    from public.hey_rate_limits r,
         lateral unnest(r.request_times) as t
   where r.user_id = v_user_id
     and t > v_now - interval '60 seconds';

  if coalesce(cardinality(v_recent), 0) >= 30 then
    update public.hey_rate_limits
       set request_times = v_recent, updated_at = v_now
     where user_id = v_user_id;
    return false;
  end if;

  v_recent := array_append(coalesce(v_recent, '{}'::timestamptz[]), v_now);
  update public.hey_rate_limits
     set request_times = v_recent, updated_at = v_now
   where user_id = v_user_id;
  return true;
end;
$$;

revoke all on function public.consume_hey_rate_limit() from public, anon;
grant execute on function public.consume_hey_rate_limit() to authenticated;

-- Remove stale per-user limiter rows after the active window has elapsed.
create index if not exists hey_rate_limits_updated_idx
  on public.hey_rate_limits(updated_at);
