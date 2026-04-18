/**
 * Client-side per-word TTS cache. Powers the Sound It Out
 * Science-of-Reading feature: any word the child taps is pronounced
 * aloud. First tap fetches the audio from /api/tts-word; subsequent
 * taps replay the cached blob instantly.
 *
 * Cache is module-scoped (one shared cache across the whole app, not
 * per-component). Keys are case-normalized words stripped of
 * punctuation. Values are { url, audio } pairs — the url is a blob
 * URL we create once and reuse; the audio element is recreated per
 * play so overlapping taps don't interrupt each other awkwardly.
 *
 * No eviction policy for now. A parent could in theory fill up memory
 * by tapping every word on every page for an hour, but a typical
 * session touches <100 unique words and each cached blob is ~5kB.
 * We can add an LRU later if needed.
 *
 * Intentionally does NOT share the narrator's AI voice audio cache —
 * this is a different use case (short word clips vs full-page
 * narration) with different caching semantics.
 */

interface CachedWordAudio {
  url: string;
}

const cache = new Map<string, CachedWordAudio>();
const pending = new Map<string, Promise<CachedWordAudio | null>>();

function cleanKey(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/gi, "");
}

/** Fetch + cache (no play). Useful for pre-warming hot words. */
async function fetchWordAudio(word: string): Promise<CachedWordAudio | null> {
  const key = cleanKey(word);
  if (!key) return null;

  const existing = cache.get(key);
  if (existing) return existing;
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = await fetch("/api/tts-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.audio) return null;
      const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.contentType ?? "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const entry = { url };
      cache.set(key, entry);
      return entry;
    } catch {
      return null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, promise);
  return promise;
}

/** Play a word's audio. Returns a promise that resolves when playback
 *  starts (or fails silently). Does NOT wait for playback to finish —
 *  kids tapping rapidly shouldn't block. */
export async function speakWord(word: string): Promise<void> {
  const entry = await fetchWordAudio(word);
  if (!entry) return;
  try {
    const audio = new Audio(entry.url);
    // A hair of volume-down so a word tap sits under the narration
    // if both play concurrently (narration pause is best-effort).
    audio.volume = 0.95;
    await audio.play();
  } catch {
    /* ignore — autoplay policy, etc. Silent failure is better than
       surfacing an error to a child whose instinct was to tap a word */
  }
}

/** Speak a word broken into syllables. Each syllable is a separate
 *  /api/tts-word fetch (cached independently) played in sequence with
 *  a small pause. Used by the Sound It Out mode in VocabWordModal.
 *
 *  The delay between syllables is deliberate — teachers instruct kids
 *  to hear the break, not the flow. 250ms feels like a slightly
 *  exaggerated "ELLL... eh... FANT" pace without feeling stilted. */
export async function speakSyllables(
  word: string,
  syllables: string[],
  opts: { pauseMs?: number } = {},
): Promise<void> {
  const pauseMs = opts.pauseMs ?? 250;
  // Pre-fetch all syllables in parallel so the sequence plays smoothly
  // without network wait between them.
  const entries = await Promise.all(syllables.map((s) => fetchWordAudio(s)));
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e) continue;
    try {
      const audio = new Audio(e.url);
      audio.volume = 0.95;
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } catch { /* ignore */ }
    if (i < entries.length - 1) {
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  }
  // After syllable playback, speak the whole word at natural pace as
  // a recap so the kid hears both the broken-down and the unified form.
  // This pairs with the way phonics is actually taught.
  await new Promise((r) => setTimeout(r, pauseMs));
  await speakWord(word);
}
