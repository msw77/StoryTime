import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const statements = [
  // Users table
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id text UNIQUE NOT NULL,
    email text,
    name text,
    subscription_status text DEFAULT 'free',
    subscription_ends_at timestamptz,
    created_at timestamptz DEFAULT now()
  )`,

  // Child profiles
  `CREATE TABLE IF NOT EXISTS child_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    age integer,
    avatar_emoji text DEFAULT '🧒',
    preferences jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
  )`,

  // Stories
  `CREATE TABLE IF NOT EXISTS stories (
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
  )`,

  // Reading history
  `CREATE TABLE IF NOT EXISTS readings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    child_profile_id uuid REFERENCES child_profiles(id),
    story_id uuid REFERENCES stories(id),
    pages_read integer DEFAULT 0,
    total_pages integer,
    completed boolean DEFAULT false,
    rating integer,
    read_at timestamptz DEFAULT now()
  )`,

  // Enable RLS
  `ALTER TABLE users ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE child_profiles ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE stories ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE readings ENABLE ROW LEVEL SECURITY`,

  // Users policies
  `CREATE POLICY IF NOT EXISTS users_select ON users FOR SELECT USING (true)`,
  `CREATE POLICY IF NOT EXISTS users_update ON users FOR UPDATE USING (
    clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'
  )`,

  // Child profiles policies
  `CREATE POLICY IF NOT EXISTS profiles_select ON child_profiles FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
  )`,
  `CREATE POLICY IF NOT EXISTS profiles_insert ON child_profiles FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
  )`,
  `CREATE POLICY IF NOT EXISTS profiles_update ON child_profiles FOR UPDATE USING (
    user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
  )`,
  `CREATE POLICY IF NOT EXISTS profiles_delete ON child_profiles FOR DELETE USING (
    user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
  )`,

  // Stories policies
  `CREATE POLICY IF NOT EXISTS stories_select ON stories FOR SELECT USING (
    is_built_in = true OR user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
  )`,
  `CREATE POLICY IF NOT EXISTS stories_insert ON stories FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub')
  )`,

  // Readings policies
  `CREATE POLICY IF NOT EXISTS readings_select ON readings FOR SELECT USING (
    child_profile_id IN (
      SELECT cp.id FROM child_profiles cp JOIN users u ON cp.user_id = u.id
      WHERE u.clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'
    )
  )`,
  `CREATE POLICY IF NOT EXISTS readings_insert ON readings FOR INSERT WITH CHECK (
    child_profile_id IN (
      SELECT cp.id FROM child_profiles cp JOIN users u ON cp.user_id = u.id
      WHERE u.clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'
    )
  )`,
];

console.log("Setting up StoryTime database...\n");

for (const sql of statements) {
  const label = sql.trim().slice(0, 60).replace(/\s+/g, " ");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({}),
  });

  // Use the SQL endpoint directly via pg
  const pgRes = await fetch(`${SUPABASE_URL}/pg`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (pgRes.ok) {
    console.log(`✓ ${label}...`);
  } else {
    const text = await pgRes.text();
    // Try alternative approach
    const altRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql_query: sql }),
    });
    if (altRes.ok) {
      console.log(`✓ ${label}...`);
    } else {
      console.log(`? ${label}... (may need SQL editor)`);
    }
  }
}

console.log("\nDone! If any steps showed '?', run them in the Supabase SQL Editor.");
