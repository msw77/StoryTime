-- Add columns needed so saved AI stories can regenerate their illustrations
-- with the same character consistency when reopened from the library.
--
-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS full_pages jsonb,
  ADD COLUMN IF NOT EXISTS character_description text;
