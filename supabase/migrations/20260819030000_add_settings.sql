-- Add settings column to profiles table
alter table public.profiles
add column if not exists settings jsonb not null default '{
  "Long-Term Memory": true,
  "Personalized Intelligence": true,
  "Voice Activation": true,
  "Automatic Organization": true,
  "Proactive Suggestions": true
}'::jsonb;
