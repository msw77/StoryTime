"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WordMoment, WordEffect, SoundCue } from "@/types/story";

// ─── Sound playback ──────────────────────────────────────────────────
//
// Real .mp3 foley samples loaded from /public/sfx/<cue>.mp3. Each play()
// call creates a fresh HTMLAudioElement — no shared cache, no cloneNode
// — so there's zero risk of this interacting with the narration audio
// element in useSpeech. The browser's HTTP cache handles re-fetches
// after the first play, so there's no meaningful perf cost.
//
// Missing files resolve to a failed .play() promise which we silently
// swallow. That lets us scaffold this system without the assets blocking
// anything.
//
// Intentionally *not* using Web Audio synthesis. The previous attempt's
// synthesized footsteps sounded like thumps, not feet, and the user
// flagged that as "less bad but not sure". Real foley or nothing.

// Max playback duration per cue (ms). The mixkit samples include some
// looping files (e.g. footsteps is a 15s walk loop), but we want a quick
// beat — just enough to register, not a minute of audio droning under
// the narration. Pause after the cap so the cue feels like a short
// punctuation mark. Undefined = play to natural end.
const CUE_MAX_MS: Partial<Record<SoundCue, number>> = {
  footsteps: 1600,
  splash: 1200,
  knock: 1200,
  wind: 2000,
  "door-close": 1500,
  "door-creak": 2000,
  giggle: 1500,
  "heart-beat": 1500,
  whoosh: 1000,
  "ink-stamp": 800,
};

function playSound(cue: SoundCue) {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio(`/sfx/${cue}.mp3`);
    audio.volume = 0.45; // sit under narration
    // .play() returns a promise; swallow failures (missing file, autoplay
    // policy, decode error) so a broken cue never escalates into anything
    // that could interfere with the narration element.
    void audio.play().catch(() => { /* silent */ });

    const cap = CUE_MAX_MS[cue];
    if (cap) {
      // Single stop timer — ramp volume to zero just before pausing so
      // the cut isn't audible as a click. Two setTimeouts total, scoped
      // tightly to this local `audio` — no closure leaks, no global
      // state touched.
      setTimeout(() => { audio.volume = 0.1; }, cap - 120);
      setTimeout(() => { try { audio.pause(); } catch { /* ignore */ } }, cap);
    }
  } catch { /* ignore */ }
}

// ─── Hook ────────────────────────────────────────────────────────────

interface UseWordMomentsArgs {
  moments: WordMoment[] | null | undefined;
  pageIdx: number;
  wordIndex: number;
  speaking: boolean;
  effectsEnabled: boolean;
}

/** Watches narration progress and returns a map of wordIndex → visual
 *  effect for any moment whose at_word has been reached on this page
 *  visit. Also fires the matching sound cue exactly once per moment.
 *
 *  The returned map is stable across renders that don't change it, so
 *  the ReaderScreen render loop can just index into it per word span
 *  without tracking activation state itself. */
export function useWordMoments({
  moments,
  pageIdx,
  wordIndex,
  speaking,
  effectsEnabled,
}: UseWordMomentsArgs): Record<number, WordEffect> {
  const firedRef = useRef<Set<number>>(new Set());
  const [activeEffects, setActiveEffects] = useState<Record<number, WordEffect>>({});

  // Reset when page changes or effects get toggled off. Without this, a
  // replay of the same page wouldn't re-fire anything, and a fired effect
  // would persist onto the next page's word at the same index.
  useEffect(() => {
    firedRef.current = new Set();
    setActiveEffects({});
  }, [pageIdx, effectsEnabled]);

  // Fire any moments whose at_word has been reached. We match on >= so a
  // wordIndex jump (seek, fast narration) still triggers the moment.
  useEffect(() => {
    if (!effectsEnabled) return;
    if (!speaking) return;
    if (!moments || moments.length === 0) return;
    if (wordIndex < 0) return;

    let added: Record<number, WordEffect> | null = null;
    for (const m of moments) {
      if (firedRef.current.has(m.at_word)) continue;
      if (wordIndex >= m.at_word) {
        firedRef.current.add(m.at_word);
        if (m.sound) playSound(m.sound);
        if (m.effect) {
          if (!added) added = {};
          // Apply the effect to `span` consecutive words starting at
          // at_word. Span defaults to 1. This lets a single moment
          // cover a phrase — e.g. "heart beat" pulsing as one unit —
          // rather than needing multiple moments that would fire
          // slightly out of sync as the narrator moved word-by-word.
          const span = Math.max(1, m.span ?? 1);
          for (let j = 0; j < span; j++) {
            added[m.at_word + j] = m.effect;
          }
        }
      }
    }
    if (added) {
      setActiveEffects((prev) => ({ ...prev, ...added! }));
    }
  }, [wordIndex, moments, speaking, effectsEnabled]);

  // Return the same object reference when nothing changed so downstream
  // memoization doesn't thrash. useMemo with activeEffects as dep keeps
  // the identity stable per state change.
  return useMemo(() => activeEffects, [activeEffects]);
}
