-- Rate-limit counter table (replaces Upstash Redis).
--
-- Why: the paid AI endpoints (story/image/tts/save) cap per-user usage so a
-- runaway or abusive client can't drain the Anthropic/OpenAI/fal budget. We
-- used Upstash Redis for this, but its free databases get deleted after ~14
-- days of inactivity — and when it vanished, the limiter took the whole app
-- down. Supabase (this database) already holds our real data and is kept
-- awake by the daily keep-alive cron, so we move the counter here: one less
-- service that can silently disappear.
--
-- How it works: each rate-limited request inserts one tiny row. To check a
-- limit we count this user's rows for that action within the time window.
-- Old rows are purged daily by the keep-alive cron.
--
-- Run this ONCE in the Supabase SQL Editor
-- (supabase.com -> your project -> SQL Editor -> New query -> paste -> Run).

create table if not exists rate_limit_events (
  id         bigint generated always as identity primary key,
  bucket     text        not null,             -- "<action>:<userId>"
  created_at timestamptz not null default now()
);

-- Index the exact lookup the limiter does: rows for one bucket in a window.
create index if not exists idx_rate_limit_events_bucket_time
  on rate_limit_events (bucket, created_at);

-- Lock it down: RLS on with no policies, so the public anon key can't touch
-- it. Our server code uses the service role key, which bypasses RLS.
alter table rate_limit_events enable row level security;
