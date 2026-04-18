/**
 * Word-timing reconciliation — turns a stream of Whisper tokens into a
 * per-display-word start-time array suitable for driving highlight
 * rendering.
 *
 * Why: the old approach built a (whisperIdx → displayIdx) map and the
 * RAF loop chased Whisper tokens. That works when every display word has
 * at least one Whisper token, but falls apart when Whisper splits or
 * merges tokens differently than our whitespace-based display splitter.
 * Analyzer (2026-04-18) found 586 orphan display words across the
 * corpus — display words with zero Whisper tokens mapped to them,
 * which appear to the user as "the highlight skipped that word."
 *
 * New approach: produce `displayStartTimes[i]` = the audio time at which
 * display word i should start being highlighted. For orphan words we
 * linearly interpolate between the nearest real anchors on either side,
 * weighted by character position in the cleaned text. The RAF loop can
 * then do a single binary-search on this array each frame.
 *
 * Shared by:
 *   - src/hooks/useSpeech.ts (runtime highlight)
 *   - scripts/analyze-highlight-drift.mjs (offline QA) — via copy since
 *     the script is .mjs and can't import TS directly.
 */

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface ReconciledTimings {
  /** The input text split on whitespace — one entry per display word. */
  displayWords: string[];
  /**
   * For each display word: the audio time (seconds) at which its
   * highlight should turn on. Real anchors where at least one Whisper
   * token maps; interpolated values for orphans.
   */
  displayStartTimes: number[];
  /**
   * For each display word: `true` if the start time is a real Whisper
   * anchor, `false` if interpolated. Surfaced so diagnostics can report
   * "X% of words had real anchors" but NOT used by the RAF loop.
   */
  isAnchor: boolean[];
  /** Debug-only: how many display words had zero real Whisper tokens. */
  orphanCount: number;
  /** Debug-only: how many display words got 3+ Whisper tokens. */
  pileupCount: number;
}

/** Strip everything except letters and digits (Unicode-aware). */
function cleanChars(w: string): string {
  return (w || "").replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Core reconciler.
 *
 * Algorithm:
 *   1. Split text on whitespace → display words.
 *   2. For each display word, compute its cleaned-char offset range.
 *   3. Walk Whisper tokens accumulating cleaned chars, placing each
 *      token on the display word whose range contains it. Punctuation-
 *      only tokens (0 cleaned chars) stay on the previous word.
 *   4. For each display word, gather the Whisper tokens mapped to it;
 *      if any exist, the word's start time = earliest token start. This
 *      is the *anchor*.
 *   5. For any display word with zero mapped tokens (orphan), linearly
 *      interpolate between the nearest real anchor before and after,
 *      weighted by cleaned-character position. This guarantees strictly
 *      monotonic start times and eliminates "highlight skipped that
 *      word" events.
 *
 * Edge cases:
 *   - Leading orphans (before first anchor): share the first anchor's
 *     time (i.e., all get highlighted at once at audio start). Rare —
 *     usually the first Whisper token lines up with the first word.
 *   - Trailing orphans (after last anchor): extrapolate using the last
 *     real anchor's time plus a fraction of (audio end - last anchor)
 *     proportional to their char position. If audio duration isn't
 *     known we default to +0.2s per orphan, which is roughly natural
 *     reading pace.
 *   - No anchors at all: distribute orphans evenly across [0, duration].
 *     Only happens if Whisper completely failed (e.g. h1 p3 Apollo 11).
 */
export function reconcileTimings(
  text: string,
  timings: WordTiming[],
  audioDurationSec?: number
): ReconciledTimings {
  const displayWords = text.split(/\s+/).filter(Boolean);
  const displayLen = displayWords.length;

  if (displayLen === 0) {
    return {
      displayWords: [],
      displayStartTimes: [],
      isAnchor: [],
      orphanCount: 0,
      pileupCount: 0,
    };
  }

  // ── 1. Compute clean-char starts per display word ────────────────
  const displayCharLens = new Array<number>(displayLen);
  const displayCharStarts = new Array<number>(displayLen);
  let pos = 0;
  for (let i = 0; i < displayLen; i++) {
    displayCharStarts[i] = pos;
    displayCharLens[i] = cleanChars(displayWords[i]).length;
    pos += displayCharLens[i];
  }
  const totalDisplayChars = pos;

  // Midpoint of each display word in clean-char space. Used for
  // interpolating orphan positions so the fallback time reflects
  // "where in the sentence this word sits" rather than its starting
  // edge — feels slightly more natural when word lengths vary.
  const displayMidpoints = new Array<number>(displayLen);
  for (let i = 0; i < displayLen; i++) {
    displayMidpoints[i] = displayCharStarts[i] + displayCharLens[i] / 2;
  }

  // ── 2. Walk Whisper tokens → map to display words ────────────────
  const displayAnchorStart: Array<number | null> = new Array(displayLen).fill(null);
  const displayTokenCount = new Array<number>(displayLen).fill(0);
  let cursor = 0;
  let di = 0;
  for (let i = 0; i < timings.length; i++) {
    const t = timings[i];
    const cleanLen = cleanChars(t.word).length;
    if (cleanLen > 0) {
      while (di + 1 < displayLen && displayCharStarts[di + 1] <= cursor) di++;
    }
    displayTokenCount[di]++;
    // First Whisper token to land here "owns" the start time. Later
    // tokens on the same display word (pileups) don't push it later.
    if (displayAnchorStart[di] === null) {
      displayAnchorStart[di] = t.start;
    }
    cursor += cleanLen;
  }

  // ── 3. Collect real-anchor indices for interpolation ─────────────
  const anchorIdxs: number[] = [];
  for (let i = 0; i < displayLen; i++) {
    if (displayAnchorStart[i] !== null) anchorIdxs.push(i);
  }

  const displayStartTimes = new Array<number>(displayLen);
  const isAnchor = new Array<boolean>(displayLen);

  // Degenerate case: Whisper returned nothing usable (e.g. corrupt page).
  // Spread all display words evenly across the known audio duration. If
  // we don't have a duration, fall back to 0.2s per word which matches
  // typical reading pace for TTS at 1.0x.
  if (anchorIdxs.length === 0) {
    const total = audioDurationSec ?? displayLen * 0.2;
    for (let i = 0; i < displayLen; i++) {
      displayStartTimes[i] = (i / Math.max(displayLen, 1)) * total;
      isAnchor[i] = false;
    }
    return {
      displayWords,
      displayStartTimes,
      isAnchor,
      orphanCount: displayLen,
      pileupCount: 0,
    };
  }

  // ── 4. Fill in anchor times, interpolate orphans ─────────────────
  // Walk display words, keeping running prev/next anchor indices.
  let nextAnchorCursor = 0;
  for (let i = 0; i < displayLen; i++) {
    if (displayAnchorStart[i] !== null) {
      displayStartTimes[i] = displayAnchorStart[i] as number;
      isAnchor[i] = true;
      continue;
    }
    isAnchor[i] = false;

    // Find last anchor at or before i.
    let prevAnchor = -1;
    for (let a = anchorIdxs.length - 1; a >= 0; a--) {
      if (anchorIdxs[a] <= i) {
        prevAnchor = anchorIdxs[a];
        break;
      }
    }
    // Find first anchor at or after i.
    while (
      nextAnchorCursor < anchorIdxs.length &&
      anchorIdxs[nextAnchorCursor] <= i
    ) {
      nextAnchorCursor++;
    }
    const nextAnchor =
      nextAnchorCursor < anchorIdxs.length ? anchorIdxs[nextAnchorCursor] : -1;

    if (prevAnchor === -1 && nextAnchor === -1) {
      // Impossible given anchorIdxs.length>0, but keep TS happy.
      displayStartTimes[i] = 0;
    } else if (prevAnchor === -1) {
      // Leading orphan: pin to the next anchor's time (highlight turns
      // on at first real word, runs of leading orphans all fire at once).
      displayStartTimes[i] = displayAnchorStart[nextAnchor] as number;
    } else if (nextAnchor === -1) {
      // Trailing orphan: extrapolate forward from the last anchor. Use
      // audio duration if we have it; otherwise assume ~0.2s per orphan
      // word which matches typical TTS pacing.
      const prevTime = displayAnchorStart[prevAnchor] as number;
      const endTime =
        audioDurationSec !== undefined && audioDurationSec > prevTime
          ? audioDurationSec
          : prevTime + (displayLen - prevAnchor) * 0.2;
      const totalCharSpan =
        displayMidpoints[displayLen - 1] +
        displayCharLens[displayLen - 1] / 2 -
        displayMidpoints[prevAnchor];
      const myCharOffset = displayMidpoints[i] - displayMidpoints[prevAnchor];
      const frac = totalCharSpan > 0 ? myCharOffset / totalCharSpan : 0;
      displayStartTimes[i] = prevTime + (endTime - prevTime) * frac;
    } else {
      // Interior orphan: linear interpolation between surrounding anchors
      // weighted by cleaned-char midpoint position.
      const prevTime = displayAnchorStart[prevAnchor] as number;
      const nextTime = displayAnchorStart[nextAnchor] as number;
      const totalCharSpan =
        displayMidpoints[nextAnchor] - displayMidpoints[prevAnchor];
      const myCharOffset = displayMidpoints[i] - displayMidpoints[prevAnchor];
      const frac = totalCharSpan > 0 ? myCharOffset / totalCharSpan : 0;
      displayStartTimes[i] = prevTime + (nextTime - prevTime) * frac;
    }
  }

  // ── 5. Enforce strict monotonicity ──────────────────────────────
  // If Whisper anchors ever go backwards (it can happen on rare splits),
  // nudge later times forward. Also catches interpolated values that
  // equal their neighbor due to identical midpoints.
  for (let i = 1; i < displayLen; i++) {
    if (displayStartTimes[i] <= displayStartTimes[i - 1]) {
      displayStartTimes[i] = displayStartTimes[i - 1] + 0.001; // 1ms nudge
    }
  }

  const orphanCount = displayLen - anchorIdxs.length;
  const pileupCount = displayTokenCount.filter((c) => c >= 3).length;

  return {
    displayWords,
    displayStartTimes,
    isAnchor,
    orphanCount,
    pileupCount,
  };
}

/**
 * Binary-search the display-word index whose start time is <= t. Used by
 * the RAF loop to find "which word should currently be highlighted."
 * Returns -1 if t is before the first word's start.
 */
export function findDisplayIndexAtTime(
  startTimes: number[],
  t: number
): number {
  if (startTimes.length === 0 || t < startTimes[0]) return -1;
  let lo = 0;
  let hi = startTimes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (startTimes[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
