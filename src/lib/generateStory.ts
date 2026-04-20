// Lifecycle-independent wrapper around the full "create a custom story"
// pipeline. Previously this logic lived inside BuilderScreen.handleCreate,
// which meant the async work was tied to the component's lifetime — if
// the user navigated away during the spinner, the in-flight fetches kept
// running but any setState callbacks became no-ops and the onStoryCreated
// callback was wired to a stale screen.
//
// Pulling this into a plain module lets the parent (page.tsx) own the
// promise at the app level. That unlocks the "Read something else — you'll
// get a ding when it's ready" flow: the user can leave the LoadingScreen
// mid-generation, the promise keeps running independent of React tree
// state, and the parent handles the result whether or not the builder
// screen is still mounted.
//
// The phases and draft autosave behavior match the original inline logic
// exactly — only the plumbing moved.

import { Story } from "@/types/story";
import { GENRES, REAL_GENRES } from "@/data/genres";
import { generateStoryOffline } from "@/lib/storyEngine";
import { prefetchStoryAudio } from "@/hooks/useSpeech";
import { saveDraft } from "@/lib/draftStory";
import { authedFetch } from "@/lib/authedFetch";

export interface GenerateStoryFormValues {
  heroName: string;
  heroTypeClean: string;
  obstacle: string;
  genre: string; // may still be "random" — we resolve below
  age: string;
  duration: string;
  finalLesson: string;
  extras: string;
}

export interface GenerateStoryCallbacks {
  /** Fire when the generation phase changes (used to update LoadingScreen copy). */
  onPhase?: (phase: "story" | "illustrations") => void;
  /** Fire on every progress tick (0-100). */
  onProgress?: (pct: number) => void;
  /** Low-overhead diagnostic hook so the caller can log phase timings. */
  onMark?: (label: string, elapsedSec: number) => void;
}

export interface GenerateStoryResult {
  story: Story;
  /** True if the primary Claude path failed and we fell back to the
   *  offline story engine. Callers may want to note this in telemetry
   *  or display a quieter "saved" copy than for a real AI story. */
  fellBackToOffline: boolean;
}

/**
 * Runs the full story-creation pipeline end-to-end and returns the final
 * Story object. Throws if BOTH the AI path and the offline fallback fail.
 *
 * This function must NOT call any React state setters directly — it
 * communicates progress purely via the optional callbacks. That's what
 * makes it safe to kick off from a component and let it run even after
 * the component unmounts.
 */
export async function generateStoryFlow(
  form: GenerateStoryFormValues,
  cb: GenerateStoryCallbacks = {},
): Promise<GenerateStoryResult> {
  const { heroName, heroTypeClean, obstacle, age, duration, finalLesson, extras } = form;

  // Resolve "random" to a concrete genre so the API gets a real value and
  // the saved story ends up tagged with whatever was rolled.
  const resolvedGenre =
    form.genre === "random"
      ? REAL_GENRES[Math.floor(Math.random() * REAL_GENRES.length)].id
      : form.genre;
  const gc = GENRES.find((g) => g.id === resolvedGenre);

  const t0 = performance.now();
  const mark = (label: string) => {
    const secs = (performance.now() - t0) / 1000;
    cb.onMark?.(label, secs);
  };

  try {
    // ── Phase 1: Claude story text ─────────────────────────────────────
    cb.onPhase?.("story");
    mark("story generation started");
    const res = await authedFetch("/api/generate-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heroName,
        heroType: heroTypeClean,
        genre: resolvedGenre,
        age,
        obstacle,
        lesson: finalLesson,
        extras,
        duration,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "AI generation failed");
    }

    const data = await res.json();
    mark("story text received");

    // ── Autosave draft (text-only) ─────────────────────────────────────
    // The moment Claude hands us a story, dump a minimal version to
    // localStorage so it survives a crash during image/audio fetching
    // or the reader render. Overwritten below once the full story
    // object is built.
    try {
      const earlyDraft: Story = {
        id: "ai_" + Date.now(),
        title: data.title,
        emoji: data.emoji || "✨",
        color: gc?.color || "#6366f1",
        genre: resolvedGenre,
        age,
        pages: data.pages,
        fullPages: data.fullPages,
        generated: true,
        duration,
        heroType: heroTypeClean,
        characterDescription: data.characterDescription || "",
      };
      saveDraft(earlyDraft);
    } catch { /* never block generation on draft save */ }

    // ── Phase 2: page 1 illustration only ──────────────────────────────
    cb.onPhase?.("illustrations");
    cb.onProgress?.(50);

    const totalPages = data.pages.length;
    const preloadedImages: (string | null)[] = new Array(totalPages).fill(null);

    if (data.fullPages && data.fullPages.length > 0 && data.fullPages[0]?.scene) {
      const charDesc = data.characterDescription || "";
      try {
        const imgRes = await authedFetch("/api/generate-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pages: [{
              scene: data.fullPages[0].scene,
              mood: data.fullPages[0].mood || "warm",
              index: 0,
            }],
            characterDescription: charDesc,
            heroType: heroTypeClean,
          }),
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          for (const img of imgData.images) {
            if (img.url) preloadedImages[img.index] = img.url;
          }
        }
      } catch (imgErr) {
        console.warn("Page 1 image failed:", imgErr);
      }
    }
    cb.onProgress?.(85);
    mark("page 1 illustration done");

    const story: Story = {
      id: "ai_" + Date.now(),
      title: data.title,
      emoji: data.emoji || "✨",
      color: gc?.color || "#6366f1",
      genre: resolvedGenre,
      age,
      pages: data.pages,
      fullPages: data.fullPages,
      generated: true,
      duration,
      heroType: heroTypeClean,
      characterDescription: data.characterDescription || "",
      preloadedImages,
    };

    // ── Autosave draft (full version) ──────────────────────────────────
    try { saveDraft(story); } catch { /* never block */ }

    // ── Phase 3: warm page 1 audio ─────────────────────────────────────
    cb.onProgress?.(98);
    if (Array.isArray(data.pages) && data.pages.length > 0) {
      const pageTexts = (data.pages as [string, string][]).map((p) => p[1]);
      await prefetchStoryAudio(pageTexts, undefined, { maxPages: 1 });
    }
    cb.onProgress?.(100);
    mark("audio warmed, opening reader");

    return { story, fellBackToOffline: false };
  } catch (aiError) {
    console.warn("AI generation failed, falling back to offline engine:", aiError);
    // Fall back to the deterministic offline engine. If it also throws,
    // we let that bubble up to the caller.
    const result = generateStoryOffline({
      heroName,
      heroType: heroTypeClean,
      obstacle,
      genre: resolvedGenre,
      age,
      lesson: finalLesson,
      duration,
    });
    const story: Story = {
      id: "gen_" + Date.now(),
      title: result.title,
      emoji: result.emoji || "✨",
      color: gc?.color || "#6366f1",
      genre: resolvedGenre,
      age,
      pages: result.pages,
      generated: true,
      duration,
    };
    return { story, fellBackToOffline: true };
  }
}
