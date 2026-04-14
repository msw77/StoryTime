-- Phase B: Audio persistence for saved custom stories.
-- Adds columns to store per-page mp3 URLs + Whisper word timings so reopening
-- a saved story plays audio instantly without re-calling OpenAI TTS/Whisper.
--
-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- 1) Story row columns ---------------------------------------------------------
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS audio_urls jsonb,
  ADD COLUMN IF NOT EXISTS word_timings jsonb;

-- 2) Storage bucket for the mp3 files ------------------------------------------
-- PRIVATE bucket: audio contains child-personalized narration content, which
-- is COPPA-sensitive. We serve it via short-lived signed URLs minted in
-- /api/stories, not via public URLs. Writes are restricted to the service
-- role key (server-side only) by default.
--
-- If you ran an earlier version of this migration that created the bucket
-- as public, run scripts/migration-security-hardening.sql to flip it to
-- private and drop the public read policy.
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-audio', 'story-audio', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- No public-read policy is created here on purpose — the server (service
-- role) has full access and mints signed URLs on demand for the owner.
