-- Cost tracking migration — three tables that let us track everything
-- spent across the app in one place:
--
--   api_usage        → every live call to Anthropic / OpenAI / fal.ai,
--                       auto-logged via src/lib/costTracking.ts. This
--                       table grows with app usage and is the source of
--                       truth for "what did we spend today".
--
--   one_time_costs   → manual entries for things we spent once (classics
--                       generation batches, brand asset generation, etc.)
--                       so the dashboard can show a complete picture.
--
--   flat_costs       → recurring infra (Supabase, Vercel, Clerk, domain,
--                       Stripe fees). Monthly or yearly amortized totals.
--
-- Run with: supabase db execute < scripts/migration-cost-tracking.sql
-- or paste into the Supabase SQL editor.

-- ── api_usage ────────────────────────────────────────────────────────
create table if not exists api_usage (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,           -- "anthropic" | "openai" | "fal"
  operation       text not null,           -- "story-generation" | "tts" | "whisper" | "image-generation"
  model           text,                    -- e.g. "claude-opus-4-7", "tts-1", "imagen4-fast"
  category        text,                    -- "user-story" | "classic-generation" | "brand-asset" | "admin" | NULL
  -- raw usage units captured from the API response so we can recompute
  -- cost later if pricing changes
  input_tokens    integer,
  output_tokens   integer,
  input_chars     integer,                 -- TTS uses chars, not tokens
  audio_seconds   numeric(10, 2),          -- Whisper charges by audio duration
  images_generated integer,
  -- final cost in cents for simplicity (integer math)
  cost_cents      integer not null default 0,
  -- optional linkage to a user / story so we can break down by audience
  user_id         uuid references users(id) on delete set null,
  story_id        uuid,                    -- nullable, no FK so deleted stories don't cascade
  metadata        jsonb,                   -- raw response snippets, prompt length, etc.
  created_at      timestamptz not null default now()
);

create index if not exists idx_api_usage_created_at on api_usage (created_at desc);
create index if not exists idx_api_usage_provider on api_usage (provider);
create index if not exists idx_api_usage_category on api_usage (category);
create index if not exists idx_api_usage_user_id on api_usage (user_id);

-- ── one_time_costs ───────────────────────────────────────────────────
-- Edited from the admin dashboard. Example entry: "Classics audio
-- regeneration", $9.40, incurred on 2026-04-16. These represent work
-- we did outside the live app — batch scripts, classics generation,
-- brand asset creation — that should still count toward total spend.
create table if not exists one_time_costs (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,
  provider        text,                    -- "anthropic" | "openai" | "fal" | "other"
  category        text,                    -- "classics" | "brand" | "design" | "other"
  cost_cents      integer not null,
  occurred_at     date not null default current_date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_one_time_costs_occurred_at on one_time_costs (occurred_at desc);

-- ── flat_costs ───────────────────────────────────────────────────────
-- Recurring infrastructure. Dashboard reads these for the "flat" band
-- on the daily breakdown (allocated as amount / 30 for daily amortization).
create table if not exists flat_costs (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,           -- "Supabase Pro", "Vercel Hobby", etc.
  provider        text,                    -- "supabase" | "vercel" | "clerk" | "stripe" | "domain" | ...
  cadence         text not null check (cadence in ('monthly', 'yearly', 'one-time')),
  cost_cents      integer not null,
  started_on      date not null default current_date,
  ended_on        date,                    -- null = still active
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_flat_costs_active
  on flat_costs (started_on)
  where ended_on is null;

-- Seed flat costs from a known good baseline. Parent can edit/delete
-- from the admin dashboard.
insert into flat_costs (label, provider, cadence, cost_cents, notes)
values
  ('Supabase Pro',  'supabase', 'monthly', 2500, 'Pro plan — higher storage + DB'),
  ('Vercel Hobby',  'vercel',   'monthly', 0,    'Free tier — upgrade to Pro $20/mo when traffic requires'),
  ('Clerk',         'clerk',    'monthly', 0,    'Free tier — upgrade when past 10k MAU'),
  ('Domain',        'domain',   'yearly',  1500, 'Estimated — update with real amount'),
  ('Upstash Redis', 'upstash',  'monthly', 0,    'Free tier')
on conflict do nothing;
