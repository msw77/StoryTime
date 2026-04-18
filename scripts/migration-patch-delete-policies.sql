-- Patch migration — adds DELETE RLS policies to the two new
-- analytics tables (vocabulary_encounters, comprehension_responses).
-- The original migrations shipped with SELECT/INSERT/UPDATE only. In
-- practice, row cleanup happens via ON DELETE CASCADE when a child
-- profile is deleted — but RLS defense-in-depth should cover the
-- case where a parent uses their own Clerk session with a direct
-- Supabase client.
--
-- Required for COPPA right-to-delete compliance.
--
-- Idempotent: uses DROP POLICY IF EXISTS so re-running is safe.

DROP POLICY IF EXISTS "vocab_owner_delete" ON vocabulary_encounters;
CREATE POLICY "vocab_owner_delete" ON vocabulary_encounters
  FOR DELETE USING (
    child_profile_id IN (
      SELECT id FROM child_profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "comp_owner_delete" ON comprehension_responses;
CREATE POLICY "comp_owner_delete" ON comprehension_responses
  FOR DELETE USING (
    child_profile_id IN (
      SELECT id FROM child_profiles WHERE user_id = auth.uid()
    )
  );
