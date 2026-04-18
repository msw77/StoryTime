import { createServiceClient } from "@/lib/supabase";
import {
  parseJsonBody,
  requireDbUserId,
  validateChildProfileOwnership,
} from "@/lib/api-helpers";
import { NextResponse } from "next/server";
import { z } from "zod";

// POST /api/vocabulary — record a Word Glow lookup (kid tapped a
// vocab-flagged word to see its definition). One write per tap.
//
// Semantics: UPSERT on (child_profile_id, word). First tap creates the
// row with first_story_id/first_page_idx populated. Subsequent taps
// update last_looked_up_at and bump times_looked_up.
//
// The upsert uses Postgres `on conflict` via a two-step select+update
// pattern because Supabase's upsert doesn't support returning the old
// row to detect "was this a new encounter?" cleanly. We could infer
// via `times_looked_up === 1 ? new : repeat` on the client side if
// ever needed for UI celebration.
const logLookupSchema = z.object({
  childProfileId: z.string().uuid(),
  // Normalized lowercase word (stripped of punctuation). Client does this
  // before posting so the canonical form in the DB is consistent.
  word: z.string().min(1).max(64),
  storyId: z.string().optional(),
  pageIdx: z.number().int().min(0).optional(),
});

export async function POST(req: Request) {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const parsed = await parseJsonBody(req, logLookupSchema);
    if (!parsed.ok) return parsed.response;
    const { childProfileId, word, storyId, pageIdx } = parsed.value;

    // Parent must own this child profile (defense in depth on top of RLS).
    const ownCheck = await validateChildProfileOwnership(dbUserId, childProfileId);
    if (!ownCheck.ok) return ownCheck.response;

    const supabase = createServiceClient();

    // Try insert. If (child_profile_id, word) conflicts, do an update
    // instead. Postgres' `ON CONFLICT DO UPDATE` would be one round-trip
    // but Supabase JS client requires the `upsert()` helper which
    // conflates insert + update semantics. Two explicit queries is
    // clearer and the second one only fires on a repeat tap.
    const { data: existing } = await supabase
      .from("vocabulary_encounters")
      .select("id, times_looked_up")
      .eq("child_profile_id", childProfileId)
      .eq("word", word)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("vocabulary_encounters")
        .update({
          times_looked_up: existing.times_looked_up + 1,
          last_looked_up_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) {
        console.error("vocab update failed:", error);
        return NextResponse.json({ error: "update failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, isNew: false });
    }

    const { error } = await supabase.from("vocabulary_encounters").insert({
      child_profile_id: childProfileId,
      word,
      first_story_id: storyId ?? null,
      first_page_idx: pageIdx ?? null,
    });
    if (error) {
      console.error("vocab insert failed:", error);
      return NextResponse.json({ error: "insert failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, isNew: true });
  } catch (err) {
    console.error("vocabulary POST error:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

// GET /api/vocabulary?childProfileId=... — list words this child has
// looked up, most recent first. Powers the parent dashboard's
// "vocabulary growing" card and future Word Garden view.
export async function GET(req: Request) {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const url = new URL(req.url);
    const childProfileId = url.searchParams.get("childProfileId");
    if (!childProfileId) {
      return NextResponse.json({ error: "childProfileId required" }, { status: 400 });
    }

    const ownCheck = await validateChildProfileOwnership(dbUserId, childProfileId);
    if (!ownCheck.ok) return ownCheck.response;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vocabulary_encounters")
      .select("word, first_story_id, first_looked_up_at, last_looked_up_at, times_looked_up")
      .eq("child_profile_id", childProfileId)
      .order("last_looked_up_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("vocab GET failed:", error);
      return NextResponse.json({ error: "load failed" }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("vocabulary GET error:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
