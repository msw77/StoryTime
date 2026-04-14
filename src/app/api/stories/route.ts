import { createServiceClient } from "@/lib/supabase";
import { generateTtsWithTimings, WordTiming } from "@/lib/tts";
import {
  parseJsonBody,
  requireDbUserId,
  validateChildProfileOwnership,
} from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { saveStorySchema } from "@/lib/schemas";
import { NextResponse } from "next/server";

// Signed-URL TTL for story-audio objects. One hour covers a reading session
// with plenty of slack; the client refetches the story list on each app open,
// so expired URLs are automatically refreshed the next time the user comes
// back. We deliberately keep this short to limit the blast radius if a URL
// leaks via logs/history/referrer.
const AUDIO_SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Hydrate the `audio_urls` field of a story row.
 *
 * Historically this column held public Supabase Storage URLs. For
 * COPPA/privacy reasons we now store object *paths* (e.g. "<storyId>/page-0.mp3")
 * and mint short-lived signed URLs on read. This helper handles both shapes
 * so legacy rows still work during the transition: if an entry already looks
 * like an http(s) URL we pass it through unchanged; otherwise we treat it as
 * an object path and sign it.
 */
async function signAudioPaths(
  supabase: ReturnType<typeof createServiceClient>,
  entries: (string | null)[] | null,
): Promise<(string | null)[] | null> {
  if (!Array.isArray(entries)) return entries ?? null;

  // Build the list of paths that actually need signing (skip nulls + legacy
  // public URLs). We batch via createSignedUrls so we don't do N round trips.
  const toSign: { idx: number; path: string }[] = [];
  entries.forEach((entry, idx) => {
    if (!entry || typeof entry !== "string") return;
    if (entry.startsWith("http://") || entry.startsWith("https://")) return;
    toSign.push({ idx, path: entry });
  });

  if (toSign.length === 0) return entries;

  const { data: signed, error } = await supabase.storage
    .from("story-audio")
    .createSignedUrls(
      toSign.map((t) => t.path),
      AUDIO_SIGNED_URL_TTL_SECONDS,
    );

  if (error) {
    console.warn("Failed to sign audio URLs:", error.message);
    // Return nulls for the ones we couldn't sign so the reader falls back to
    // on-demand /api/tts — better than handing back stale/bad URLs.
    const copy = [...entries];
    for (const t of toSign) copy[t.idx] = null;
    return copy;
  }

  const copy = [...entries];
  signed.forEach((result, i) => {
    const targetIdx = toSign[i].idx;
    copy[targetIdx] = result.signedUrl ?? null;
  });
  return copy;
}

// GET /api/stories — load user's saved AI stories
export async function GET() {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const supabase = createServiceClient();

    // Get all their generated stories, newest first
    const { data: stories, error } = await supabase
      .from("stories")
      .select("*")
      .eq("user_id", dbUserId)
      .eq("is_generated", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load stories:", error);
      return NextResponse.json({ error: "Failed to load stories" }, { status: 500 });
    }

    // Swap stored object paths for short-lived signed URLs before returning.
    // The client has no idea about the distinction — it just sees URLs it can
    // fetch — but the bucket itself is private, so a leaked URL expires in an
    // hour and can't be bulk-scraped.
    const hydrated = await Promise.all(
      (stories || []).map(async (s) => ({
        ...s,
        audio_urls: await signAudioPaths(supabase, s.audio_urls ?? null),
      })),
    );

    return NextResponse.json(hydrated);
  } catch (err) {
    console.error("Stories GET error:", err);
    return NextResponse.json({ error: "Failed to load stories" }, { status: 500 });
  }
}

// DELETE /api/stories — delete a saved story
export async function DELETE(req: Request) {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get("id");

    if (!storyId) {
      return NextResponse.json({ error: "Missing story id" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Re-check ownership up front so we don't start deleting audio files
    // that belong to someone else if `storyId` is tampered with.
    const { data: owned } = await supabase
      .from("stories")
      .select("id")
      .eq("id", storyId)
      .eq("user_id", dbUserId)
      .maybeSingle();

    if (!owned) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // Wipe any stored audio objects for this story *before* dropping the row
    // so we never orphan storage (which would both waste money and retain
    // child-personalized audio the user expected to be deleted — a COPPA
    // right-to-deletion issue).
    try {
      const { data: audioObjects } = await supabase.storage
        .from("story-audio")
        .list(storyId);
      if (audioObjects && audioObjects.length > 0) {
        const paths = audioObjects.map((o) => `${storyId}/${o.name}`);
        const { error: removeErr } = await supabase.storage
          .from("story-audio")
          .remove(paths);
        if (removeErr) {
          // Log but continue — we'd rather leave orphaned audio than abort
          // the DB delete, because leaving the row makes the UI inconsistent.
          console.warn("Failed to clean up story audio on delete:", removeErr.message);
        }
      }
    } catch (cleanupErr) {
      console.warn("Audio cleanup threw:", (cleanupErr as Error).message);
    }

    // Only allow deleting their own stories
    const { error } = await supabase
      .from("stories")
      .delete()
      .eq("id", storyId)
      .eq("user_id", dbUserId);

    if (error) {
      console.error("Failed to delete story:", error);
      return NextResponse.json({ error: "Failed to delete story" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Stories DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete story" }, { status: 500 });
  }
}

// POST /api/stories — save a generated story
export async function POST(req: Request) {
  try {
    // Auth + user resolution are now in a shared helper so every route
    // gets the same behaviour and we have one place to update if Clerk or
    // Supabase changes.
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    // Per-user cap on story saves (10/hour). The POST body triggers TTS +
    // storage upload for every page, so an unbounded save loop would burn
    // OpenAI credits via this path just as fast as /api/tts. Cap it here
    // to close that side door.
    const rl = await enforceRateLimit("saveStory", dbUserId);
    if (!rl.ok) return rl.response;

    // Validate the request body up front. Rejects anything oversized,
    // mistyped, or missing required fields before we spend compute on it.
    const parsed = await parseJsonBody(req, saveStorySchema);
    if (!parsed.ok) return parsed.response;
    const {
      title, emoji, genre, age, pages, heroName, heroType, lesson, extras,
      childProfileId, fullPages, characterDescription, illustrationUrls,
    } = parsed.value;

    // IDOR fix: never trust a client-supplied child_profile_id. Require
    // that the profile exists AND belongs to the signed-in user before we
    // tag any row with it. Null is allowed (stories can be personal).
    const profileCheck = await validateChildProfileOwnership(dbUserId, childProfileId);
    if (!profileCheck.ok) return profileCheck.response;
    const verifiedChildProfileId = profileCheck.value;

    const supabase = createServiceClient();

    const { data: story, error } = await supabase
      .from("stories")
      .insert({
        user_id: dbUserId,
        child_profile_id: verifiedChildProfileId,
        title,
        emoji: emoji || "✨",
        genre,
        age_group: age,
        pages: JSON.stringify(pages),
        hero_name: heroName || null,
        hero_type: heroType || null,
        lesson: lesson || null,
        extras: extras || null,
        full_pages: fullPages || null,
        character_description: characterDescription || null,
        illustration_urls: Array.isArray(illustrationUrls) ? illustrationUrls : null,
        is_generated: true,
        is_built_in: false,
        page_count: pages?.length || 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to save story:", error);
      return NextResponse.json({ error: "Failed to save story" }, { status: 500 });
    }

    // ── Phase B: persist audio ────────────────────────────────────────────
    // For each page, generate TTS+Whisper once and upload the mp3 to
    // Supabase Storage. Record the public URL and word timings on the row.
    // Next time the user opens this story, the reader plays straight from
    // the stored URL — no /api/tts round trip, no OpenAI cost.
    //
    // Parallelized with a concurrency cap so we don't hammer OpenAI or run
    // out of Vercel function memory on long stories.
    // audioPaths stores the *object path* inside the private bucket (what we
    // persist to the DB). audioSignedUrls stores the fresh signed URL for
    // this single response back to the client so the reader can play
    // immediately after save without an extra GET round trip.
    const audioPaths: (string | null)[] = new Array(pages?.length || 0).fill(null);
    const wordTimingsAll: (WordTiming[] | null)[] = new Array(pages?.length || 0).fill(null);

    const CONCURRENCY = 3;
    const pageEntries: [number, string][] = Array.isArray(pages)
      ? (pages as [string, string][])
          .map((p, i) => [i, p?.[1]] as [number, string])
          .filter(([, text]) => typeof text === "string" && text.trim().length > 0)
      : [];

    async function persistOnePage(pageIdx: number, text: string): Promise<void> {
      try {
        const { audioBuffer, wordTimings } = await generateTtsWithTimings(text, "nova");
        const objectPath = `${story.id}/page-${pageIdx}.mp3`;
        const { error: uploadErr } = await supabase.storage
          .from("story-audio")
          .upload(objectPath, audioBuffer, {
            contentType: "audio/mpeg",
            upsert: true,
          });
        if (uploadErr) {
          console.warn(`Audio upload failed for page ${pageIdx}:`, uploadErr.message);
          return;
        }
        // Bucket is private — we store the object path, not a public URL.
        // Signed URLs are minted per-read in GET /api/stories (and once
        // below before returning this POST response).
        audioPaths[pageIdx] = objectPath;
        wordTimingsAll[pageIdx] = wordTimings;
      } catch (e) {
        console.warn(`TTS/upload failed for page ${pageIdx}:`, (e as Error).message);
      }
    }

    // Simple concurrency-limited runner — batches of CONCURRENCY pages
    for (let i = 0; i < pageEntries.length; i += CONCURRENCY) {
      const batch = pageEntries.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(([idx, text]) => persistOnePage(idx, text)));
    }

    // Update the row with the audio paths + timings we collected. We tolerate
    // partial failures — rows may end up with some null entries, and the
    // reader will fall back to /api/tts for those pages only.
    const gotAny = audioPaths.some((u) => u) || wordTimingsAll.some((w) => w);
    if (gotAny) {
      const { data: updated, error: updateErr } = await supabase
        .from("stories")
        .update({
          audio_urls: audioPaths,
          word_timings: wordTimingsAll,
        })
        .eq("id", story.id)
        .select()
        .single();
      if (updateErr) {
        console.warn("Failed to attach audio to story row:", updateErr.message);
        return NextResponse.json(story);
      }
      // Swap paths for fresh signed URLs so the client can play audio
      // immediately without waiting for a follow-up GET /api/stories.
      const signedAudioUrls = await signAudioPaths(supabase, updated.audio_urls ?? null);
      return NextResponse.json({ ...updated, audio_urls: signedAudioUrls });
    }

    return NextResponse.json(story);
  } catch (err) {
    console.error("Stories POST error:", err);
    return NextResponse.json({ error: "Failed to save story" }, { status: 500 });
  }
}
