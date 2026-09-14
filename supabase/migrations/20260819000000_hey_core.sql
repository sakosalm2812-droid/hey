create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'elite')),
  entitlements jsonb not null default '[]'::jsonb,
  hey_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hey_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hey_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.hey_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory text not null,
  category text not null default 'general',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.hey_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('note', 'task', 'journal', 'goal', 'habit', 'project', 'event')),
  title text not null,
  content text not null default '',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hey_conversations_user_updated_idx
  on public.hey_conversations(user_id, updated_at desc);
create index if not exists hey_messages_conversation_created_idx
  on public.hey_messages(conversation_id, created_at);
create index if not exists memory_user_created_idx
  on public.memory(user_id, created_at desc);
create index if not exists hey_records_user_kind_created_idx
  on public.hey_records(user_id, kind, created_at desc);

alter table public.profiles enable row level security;
alter table public.hey_conversations enable row level security;
alter table public.hey_messages enable row level security;
alter table public.memory enable row level security;
alter table public.hey_records enable row level security;

drop policy if exists "Users manage their profile" on public.profiles;
create policy "Users manage their profile"
  on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Users manage their conversations" on public.hey_conversations;
create policy "Users manage their conversations"
  on public.hey_conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their messages" on public.hey_messages;
create policy "Users manage their messages"
  on public.hey_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their memory" on public.memory;
create policy "Users manage their memory"
  on public.memory for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their records" on public.hey_records;
create policy "Users manage their records"
  on public.hey_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, plan, entitlements)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    coalesce(nullif(new.raw_user_meta_data->>'plan', ''), 'free'),
    coalesce(new.raw_user_meta_data->'entitlements', '[]'::jsonb)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
