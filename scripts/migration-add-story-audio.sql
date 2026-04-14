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
-- Public read so the browser can fetch audio directly via URL.
-- Writes are restricted to the service role key (server-side only).
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-audio', 'story-audio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3) Row-level policies for the storage bucket --------------------------------
-- Anyone can read (bucket is public).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'story-audio public read'
  ) THEN
    CREATE POLICY "story-audio public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'story-audio');
  END IF;
END $$;
