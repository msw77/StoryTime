-- StoryTime Database Setup
-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- Users (synced from Clerk)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id text UNIQUE NOT NULL,
  email text,
  name text,
  subscription_status text DEFAULT 'free',
  subscription_ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Child profiles (1 for premium, up to 4 for family)
CREATE TABLE IF NOT EXISTS child_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  age integer,
  avatar_emoji text DEFAULT '🧒',
  preferences jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Stories (both built-in and AI-generated)
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  child_profile_id uuid REFERENCES child_profiles(id),
  title text NOT NULL,
  emoji text,
  genre text NOT NULL,
  age_group text NOT NULL,
  pages jsonb NOT NULL,
  hero_name text,
  hero_type text,
  lesson text,
  extras text,
  illustration_urls jsonb,
  audio_urls jsonb,
  is_generated boolean DEFAULT true,
  is_built_in boolean DEFAULT false,
  page_count integer,
  created_at timestamptz DEFAULT now()
);

-- Reading history
CREATE TABLE IF NOT EXISTS readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_profile_id uuid REFERENCES child_profiles(id),
  story_id uuid REFERENCES stories(id),
  pages_read integer DEFAULT 0,
  total_pages integer,
  completed boolean DEFAULT false,
  rating integer,
  read_at timestamptz DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users: callers can only read + update their own row, matched by Clerk
-- subject claim. Historically users_select was USING (true) which let any
-- authenticated Supabase client read the entire users table via the public
-- anon key. All app-side access goes through the service-role client from
-- our /api routes, so no in-app path exploited it — but the anon key is in
-- the browser bundle, so the wide-open policy was a defense-in-depth gap.
CREATE POLICY users_select ON users FOR SELECT USING (
  clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'
);
CREATE POLICY users_update ON users FOR UPDATE USING (
  clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'
);

-- Child profiles: users can manage their own children
CREATE POLICY profiles_select ON child_profiles FOR SELECT USING (
  user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
);
CREATE POLICY profiles_insert ON child_profiles FOR INSERT WITH CHECK (
  user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
);
CREATE POLICY profiles_update ON child_profiles FOR UPDATE USING (
  user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
);
CREATE POLICY profiles_delete ON child_profiles FOR DELETE USING (
  user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
);

-- Stories: users can see built-in stories and their own generated ones
CREATE POLICY stories_select ON stories FOR SELECT USING (
  is_built_in = true OR user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
);
CREATE POLICY stories_insert ON stories FOR INSERT WITH CHECK (
  user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
);

-- Readings: users can manage readings for their children
CREATE POLICY readings_select ON readings FOR SELECT USING (
  child_profile_id IN (
    SELECT cp.id FROM child_profiles cp JOIN users u ON cp.user_id = u.id
    WHERE u.clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'
  )
);
CREATE POLICY readings_insert ON readings FOR INSERT WITH CHECK (
  child_profile_id IN (
    SELECT cp.id FROM child_profiles cp JOIN users u ON cp.user_id = u.id
    WHERE u.clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'
  )
);
