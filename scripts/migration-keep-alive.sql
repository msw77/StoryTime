-- Dedicated heartbeat table for the daily Supabase keep-alive cron.
--
-- Why a WRITE and not a READ: Supabase's free-tier auto-pause timer is
-- reliably reset by database WRITE activity. A read-only query (what the
-- keep-alive cron used to do) does not dependably count, so the project
-- kept getting paused even though the cron ran successfully every day.
-- This table gives the cron something trivial and safe to write to once
-- a day — a single row whose timestamp we overwrite. It never touches
-- any real user data.
--
-- Run this ONCE in the Supabase SQL Editor
-- (supabase.com -> your project -> SQL Editor -> New query -> paste -> Run).

create table if not exists keep_alive (
  id smallint primary key default 1,
  last_ping timestamptz not null default now(),
  -- Enforce that this table only ever holds one row.
  constraint keep_alive_singleton check (id = 1)
);

-- Seed the single row so the very first cron run has something to update.
insert into keep_alive (id, last_ping)
values (1, now())
on conflict (id) do update set last_ping = excluded.last_ping;

-- Lock the table down: enable Row Level Security with no policies, so the
-- public anon key can never read or write it. Our server code uses the
-- service role key, which bypasses RLS, so the cron still works.
alter table keep_alive enable row level security;
