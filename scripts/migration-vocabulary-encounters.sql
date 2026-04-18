-- Word Glow (Science of Reading, Pillar 4: Vocabulary) — tracks which
-- vocab words each child has actually tapped to look up. Powers:
--   • Parent dashboard "new words this week" metric
--   • Word Garden v2 (each tapped word becomes a plant)
--   • Spaced-repetition story generation (future v2)
--
-- We only write on TAP, not on render. That keeps the table focused
-- on active engagement ("Teddy looked up 'canyon'") rather than passive
-- exposure ("Teddy saw 'canyon' on page 3"). Passive-exposure tracking
-- can land later if we want to show parents words the kid was exposed
-- to but didn't investigate.
--
-- UNIQUE(child_profile_id, word) — one row per (child, word). First
-- lookup INSERTs; subsequent lookups UPDATE last_looked_up_at and
-- increment times_looked_up. We also remember which story/page the
-- FIRST lookup happened on so the dashboard can show "learned while
-- reading The Lost Map" context.

CREATE TABLE IF NOT EXISTS vocabulary_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  first_story_id TEXT,
  first_page_idx INT,
  first_looked_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_looked_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  times_looked_up INT NOT NULL DEFAULT 1,
  UNIQUE(child_profile_id, word)
);

-- Fast "recent words for this kid" query for the dashboard.
CREATE INDEX IF NOT EXISTS idx_vocab_encounters_profile_recent
  ON vocabulary_encounters (child_profile_id, last_looked_up_at DESC);

-- Row-level security: a parent can only see/edit rows for their own
-- children's profiles. Matches the pattern used by reading_history.
ALTER TABLE vocabulary_encounters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vocab_owner_select" ON vocabulary_encounters
  FOR SELECT USING (
    child_profile_id IN (
      SELECT id FROM child_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "vocab_owner_insert" ON vocabulary_encounters
  FOR INSERT WITH CHECK (
    child_profile_id IN (
      SELECT id FROM child_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "vocab_owner_update" ON vocabulary_encounters
  FOR UPDATE USING (
    child_profile_id IN (
      SELECT id FROM child_profiles WHERE user_id = auth.uid()
    )
  );
