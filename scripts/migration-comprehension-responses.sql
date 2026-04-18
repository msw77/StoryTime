-- Story Questions / comprehension_responses (Science of Reading,
-- Pillar 5: Comprehension). One row per answer the child taps at the
-- end of a story.
--
-- Per-question granularity (not per-story) so the parent dashboard can
-- break out by question TYPE: recall / inference / connection. The
-- "Teddy is strongest at recall but growing on inference" narrative
-- only works if we have the type-level data.
--
-- question_type reflects what Claude flagged the question as at
-- generation time. Connection questions always have correct = true
-- (by design — they're about the kid's feelings, not facts), but we
-- still write them so the dashboard can show engagement.

CREATE TABLE IF NOT EXISTS comprehension_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL,
  question_idx INT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('recall', 'inference', 'connection')),
  chosen_option_idx INT NOT NULL,
  correct BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dashboard queries: "this week's answers for this kid, ordered by
-- type, newest first". The composite index supports that cleanly.
CREATE INDEX IF NOT EXISTS idx_comprehension_profile_recent
  ON comprehension_responses (child_profile_id, answered_at DESC);

-- Row-level security — match the pattern from vocabulary_encounters
-- and reading_history. Parents can only read/write rows for their own
-- children's profiles.
ALTER TABLE comprehension_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_owner_select" ON comprehension_responses
  FOR SELECT USING (
    child_profile_id IN (
      SELECT id FROM child_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "comp_owner_insert" ON comprehension_responses
  FOR INSERT WITH CHECK (
    child_profile_id IN (
      SELECT id FROM child_profiles WHERE user_id = auth.uid()
    )
  );

-- DELETE policy — required for COPPA right-to-delete. When a parent
-- deletes a child profile the ON DELETE CASCADE handles row cleanup
-- via the service role, but defense-in-depth: a parent using a direct
-- Supabase client from their own Clerk session can only delete their
-- own kid's responses. Never anonymous.
CREATE POLICY "comp_owner_delete" ON comprehension_responses
  FOR DELETE USING (
    child_profile_id IN (
      SELECT id FROM child_profiles WHERE user_id = auth.uid()
    )
  );
