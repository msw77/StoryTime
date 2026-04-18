/**
 * Word-Highlight Diagnostics — Phase 0 tooling
 *
 * A tiny opt-in event bus for measuring how accurately the visible word
 * highlight tracks the underlying audio. Lives outside the useSpeech hook
 * so we can toggle it purely via URL param (?hl=1) without churning hook
 * types or forcing all consumers to pass a "debugMode" flag through.
 *
 * How it works:
 *   1. ReaderScreen checks ?hl=1 on mount and calls `enableDiagnostics()`.
 *   2. useSpeech's RAF loop reads `isDiagnosticsEnabled()` each frame; if
 *      on, it emits a `sample` every time the highlighted display word
 *      changes, carrying the timing data needed to compute drift.
 *   3. HighlightDebugOverlay subscribes and renders live stats + a
 *      rolling log that can be copied to the clipboard as CSV.
 *
 * Performance: when diagnostics are off, the only cost is a single boolean
 * check per RAF frame. No listeners, no allocations, no event dispatch.
 */

export interface DriftSample {
  /** Monotonic sample index within the current play-through. */
  seq: number;
  /** Wall-clock timestamp (ms, performance.now) when sample was recorded. */
  t: number;
  /** Current on-screen word index that just became highlighted. */
  displayIdx: number;
  /** The display word text (before punctuation stripping). */
  displayWord: string;
  /** Whisper token index chosen for this frame. */
  whisperIdx: number;
  /** Whisper token text (often includes punctuation). */
  whisperWord: string;
  /** Whisper's reported start time for this token (seconds, 1.0 speed). */
  whisperStart: number;
  /** audio.currentTime at the moment we flipped the highlight (seconds). */
  audioTime: number;
  /** Current playback rate (audio.playbackRate). */
  playbackRate: number;
  /**
   * Drift in milliseconds between when Whisper says the word started
   * and when we actually flipped the highlight. Positive = highlight
   * is late, negative = early. Computed as
   *   (audioTime - whisperStart) * 1000.
   * At 1.0x playbackRate this is a direct measure of RAF tick lag;
   * under speed changes it's still the ms-of-audio the highlight
   * trailed behind the intended word.
   */
  driftMs: number;
  /** Story id for the play-through this sample belongs to (for log filters). */
  storyId?: string;
  /** Page index for the play-through. */
  pageIdx?: number;
}

type SampleListener = (s: DriftSample) => void;

let enabled = false;
const listeners = new Set<SampleListener>();
let seqCounter = 0;

/** Turn diagnostics on for the current tab. Idempotent. */
export function enableDiagnostics(): void {
  enabled = true;
}

/** Turn diagnostics off. Existing samples in subscribers are kept. */
export function disableDiagnostics(): void {
  enabled = false;
}

/** Fast check used inside the RAF loop; do not make this expensive. */
export function isDiagnosticsEnabled(): boolean {
  return enabled;
}

/**
 * Emit a sample. Callers should already have checked isDiagnosticsEnabled()
 * so the hot path doesn't allocate a sample object when disabled.
 */
export function emitSample(
  partial: Omit<DriftSample, "seq" | "t" | "driftMs">
): void {
  if (!enabled) return;
  const sample: DriftSample = {
    ...partial,
    seq: seqCounter++,
    t: performance.now(),
    driftMs: (partial.audioTime - partial.whisperStart) * 1000,
  };
  for (const l of listeners) {
    try {
      l(sample);
    } catch {
      /* ignore listener errors so diagnostics can't break playback */
    }
  }
}

/** Reset the sequence counter when a new play-through starts. */
export function resetSequence(): void {
  seqCounter = 0;
}

/** Subscribe to live samples. Returns an unsubscribe function. */
export function subscribe(listener: SampleListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Serialize samples to CSV for copy-paste / analysis. */
export function samplesToCsv(samples: DriftSample[]): string {
  const header = [
    "seq",
    "t_ms",
    "storyId",
    "pageIdx",
    "displayIdx",
    "displayWord",
    "whisperIdx",
    "whisperWord",
    "whisperStart_s",
    "audioTime_s",
    "driftMs",
    "playbackRate",
  ].join(",");
  const rows = samples.map((s) =>
    [
      s.seq,
      Math.round(s.t),
      s.storyId ?? "",
      s.pageIdx ?? "",
      s.displayIdx,
      JSON.stringify(s.displayWord ?? ""),
      s.whisperIdx,
      JSON.stringify(s.whisperWord ?? ""),
      s.whisperStart.toFixed(3),
      s.audioTime.toFixed(3),
      s.driftMs.toFixed(1),
      s.playbackRate.toFixed(3),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

/** Summary statistics for a batch of samples. */
export interface DriftStats {
  count: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  minMs: number;
  /** Count of samples where |drift| exceeded 80ms (our p95 target). */
  overThreshold80: number;
  /** Count of samples where |drift| exceeded 200ms (catastrophic). */
  overThreshold200: number;
}

export function computeStats(samples: DriftSample[]): DriftStats | null {
  if (samples.length === 0) return null;
  const drifts = samples.map((s) => s.driftMs);
  const abs = drifts.map((d) => Math.abs(d)).sort((a, b) => a - b);
  const mean = drifts.reduce((a, b) => a + b, 0) / drifts.length;
  const median = abs[Math.floor(abs.length / 2)];
  const p95 = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.95))];
  return {
    count: samples.length,
    meanMs: mean,
    medianMs: median,
    p95Ms: p95,
    maxMs: Math.max(...abs),
    minMs: Math.min(...abs),
    overThreshold80: abs.filter((d) => d > 80).length,
    overThreshold200: abs.filter((d) => d > 200).length,
  };
}
