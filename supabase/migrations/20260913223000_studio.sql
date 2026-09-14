create table if not exists public.hey_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null check (kind in ('image','video')),
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  provider_id text,
  prompt text not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  unique (user_id,request_id)
);
alter table public.hey_generation_jobs enable row level security;
revoke all on public.hey_generation_jobs from anon, authenticated;
grant select on public.hey_generation_jobs to authenticated;
grant all on public.hey_generation_jobs to service_role;
create policy "Read own generated assets" on public.hey_generation_jobs
for select to authenticated using (auth.uid() = user_id);
create index if not exists hey_generation_jobs_user_date on public.hey_generation_jobs(user_id,created_at desc);

-- Only the authenticated Edge Function may reserve quota or mutate provider IDs.
-- The lock makes concurrent requests share one atomic daily budget.
create or replace function public.hey_reserve_generation(p_user uuid,p_request uuid,p_kind text,p_prompt text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare job public.hey_generation_jobs; tier text; daily_limit integer; used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select * into job from public.hey_generation_jobs where user_id=p_user and request_id=p_request;
  if found then return jsonb_build_object('job',to_jsonb(job),'created',false); end if;
  select case
    when lower(plan)='elite' or entitlements @> '["elite"]'::jsonb then 'elite'
    when lower(plan)='pro' or entitlements @> '["pro"]'::jsonb then 'pro'
    else 'free' end into tier from public.profiles where id=p_user;
  if tier is null then raise exception 'Account could not be verified'; end if;
  if p_kind='video' and tier not in ('pro','elite') then raise exception 'Video generation requires Pro or Elite'; end if;
  daily_limit := case tier when 'elite' then 25 when 'pro' then 10 else 3 end;
  select count(*) into used from public.hey_generation_jobs where user_id=p_user and created_at >= date_trunc('day',now());
  if used >= daily_limit then raise exception 'Daily creation limit reached. Try again tomorrow'; end if;
  insert into public.hey_generation_jobs(user_id,request_id,kind,prompt) values(p_user,p_request,p_kind,p_prompt) returning * into job;
  return jsonb_build_object('job',to_jsonb(job),'created',true);
end; $$;
revoke all on function public.hey_reserve_generation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.hey_reserve_generation(uuid,uuid,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hey-creations','hey-creations',false,20971520,array['image/png']) on conflict(id) do nothing;
create policy "Read own creation files" on storage.objects for select to authenticated
using(bucket_id='hey-creations' and (storage.foldername(name))[1]=auth.uid()::text);
