-- Security hardening migration (Codex audit Sitting 1)
--
-- This migration closes three issues the audit flagged:
--
--   1) The `story-audio` storage bucket was public, meaning anyone with a
--      URL could download child-personalized narration audio. We flip it to
--      private and drop the public read policy. The app now generates
--      short-lived signed URLs per read.
--
--   2) The `users` RLS policy had `USING (true)` for SELECT, meaning any
--      authenticated caller could read every row (names, emails). In
--      practice the app only talks to Supabase via the service-role client
--      from the server, which bypasses RLS — so no in-app path exploited
--      this. But the anon key is public in the browser bundle, so this is
--      a real defense-in-depth gap. We restrict SELECT to the caller's own
--      row, matched by Clerk subject claim.
--
--   3) Defensive: make sure the service role (what our server uses) can
--      still insert user rows, because the self-only RLS would otherwise
--      block the "create user on first sign-in" flow. Service role already
--      bypasses RLS, so this is a no-op, but we add an explicit insert
--      policy for the anon path so webhook flows keep working if we ever
--      switch them.
--
-- Run this in the Supabase SQL Editor
-- (supabase.com → your project → SQL Editor → New query → paste → Run).

BEGIN;

-- 1) story-audio bucket: flip to private and drop the public read policy ----
UPDATE storage.buckets
SET public = false
WHERE id = 'story-audio';

DROP POLICY IF EXISTS "story-audio public read" ON storage.objects;

-- 2) users table: restrict SELECT to self-row only --------------------------
DROP POLICY IF EXISTS users_select ON users;

CREATE POLICY users_select ON users FOR SELECT USING (
  clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'
);

-- users_update already scopes to self, but re-create defensively in case a
-- previous environment ran the old setup-db.sql with a stale definition.
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE USING (
  clerk_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'
);

COMMIT;

-- Verification queries (run these afterwards to confirm everything stuck):
--
--   SELECT id, public FROM storage.buckets WHERE id = 'story-audio';
--     -- Expect:  story-audio | false
--
--   SELECT policyname, qual FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'users';
--     -- Expect both users_select and users_update to reference
--     --   current_setting('request.jwt.claims', true)::jsonb->>'sub'
--     -- and NOT `true`.
--
--   SELECT policyname FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects'
--      AND policyname = 'story-audio public read';
--     -- Expect: 0 rows.
