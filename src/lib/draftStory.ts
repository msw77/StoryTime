// Draft-story autosave.
//
// Why this exists: generated stories live only in React state until the
// user hits "Save to My Library" on the end screen. If the reader crashes
// (see the "Rendered fewer hooks than expected" bug that cost us a Zoe
// story), or the user closes the tab, or the power goes out mid-read —
// the whole thing vanishes. Claude is non-deterministic so they can't
// just regenerate it.
//
// The fix is a localStorage slot that holds the most recently generated
// story until it's either (a) explicitly saved to Supabase or (b)
// overwritten by a newer generation. On next app load, if a draft is
// present, it gets injected back into the library as an "ai_*" story
// so the user can reopen and save it through the normal flow.
//
// Intentionally localStorage-only — no DB schema or API changes, zero
// risk of breaking existing save/load. Downsides: lost if the user
// clears browser data or switches devices before saving. That's fine
// for the problem we're solving (crash recovery on the same session).

import type { Story } from "@/types/story";

// Single-slot key. We keep only the *most recent* unsaved story — the
// common case is "user generates one story, reader crashes". Multiple
// pending drafts would make the recovery UX confusing and isn't what
// any real user is going to hit.
const DRAFT_KEY = "storytime:draftStory:v1";

// Bump this and add a migration block if the Story shape changes
// incompatibly. For now v1 is fine.
interface DraftEnvelope {
  version: 1;
  savedAt: number;
  story: Story;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Persist a generated story to localStorage as the current draft.
 *  Called from BuilderScreen twice during generation: once right after
 *  Claude returns (text-only), again after images attach (full version).
 *  Silently no-ops on the server or if storage is unavailable (quota,
 *  private mode, etc.) — we never want a storage hiccup to break the
 *  generation flow. */
export function saveDraft(story: Story): void {
  if (!isBrowser()) return;
  try {
    const envelope: DraftEnvelope = {
      version: 1,
      savedAt: Date.now(),
      story,
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(envelope));
  } catch {
    // Quota exceeded, private mode, etc. Swallow — draft recovery is a
    // best-effort safety net, not a critical path.
  }
}

/** Load the current draft, if any. Returns null on any failure —
 *  missing key, parse error, wrong version. Callers should treat a
 *  null return as "no draft available" without further investigation. */
export function loadDraft(): Story | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope;
    if (!parsed || parsed.version !== 1 || !parsed.story) return null;
    // Basic shape check — a corrupted blob shouldn't crash the app on
    // load. Anything missing the minimum fields gets treated as absent.
    const s = parsed.story;
    if (!s.id || !s.title || !Array.isArray(s.pages)) return null;
    return s;
  } catch {
    return null;
  }
}

/** Clear the current draft. Called after a successful save to Supabase
 *  so the library doesn't keep showing the same "unsaved" story next
 *  to the real persisted one. Also called when the user explicitly
 *  discards the draft from the library. */
export function clearDraft(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
