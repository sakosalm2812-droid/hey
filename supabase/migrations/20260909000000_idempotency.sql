-- HEY idempotency: allow clients to attach a request id so retried requests
-- do not create duplicate conversations or duplicate Forge runs.

alter table public.hey_forge_runs
  add column if not exists request_id text;

alter table public.hey_conversations
  add column if not exists request_id text;

create unique index if not exists hey_forge_runs_user_request_idx
  on public.hey_forge_runs(user_id, request_id)
  where request_id is not null;

create unique index if not exists hey_conversations_user_request_idx
  on public.hey_conversations(user_id, request_id)
  where request_id is not null;