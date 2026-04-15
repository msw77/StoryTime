"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sentence, SpeechControls, VoiceMode, AIVoiceName } from "@/types/story";

// ─── Browser voice helpers ───────────────────────────────────────────

const PRIORITY_VOICES = [
  "daniel (enhanced)", "samantha (enhanced)", "karen (enhanced)", "moira (enhanced)",
  "daniel (premium)", "samantha (premium)", "karen (premium)",
  "daniel", "samantha", "karen", "moira", "tessa", "fiona",
  "google uk english female", "google us english",
  "microsoft aria", "microsoft jenny", "microsoft guy",
  "zira", "rishi", "nicky", "alex",
];

function getEnglishVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
}

function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const p of PRIORITY_VOICES) {
    const f = voices.find((v) => v.name.toLowerCase().includes(p));
    if (f) return f;
  }
  const enhanced = voices.find((v) => /enhanced|premium/i.test(v.name));
  if (enhanced) return enhanced;
  return voices[0] || null;
}

function splitSentences(text: string): { allWords: string[]; sentences: Sentence[] } {
  const allWords = text.split(/\s+/).filter(Boolean);
  const sentences: Sentence[] = [];
  let buf = "", wordStart = 0, wordCount = 0;
  for (let i = 0; i < allWords.length; i++) {
    buf += (buf ? " " : "") + allWords[i];
    wordCount++;
    const last = allWords[i];
    if (/[.!?]["'\u2019\u201D]?$/.test(last) || i === allWords.length - 1) {
      sentences.push({ text: buf.trim(), startIdx: wordStart, endIdx: wordStart + wordCount - 1 });
      buf = ""; wordStart = i + 1; wordCount = 0;
    }
  }
  return { allWords, sentences };
}

function pitchForSentence(text: string): number {
  if (text.endsWith("?")) return 1.05;
  if (text.endsWith("!")) return 0.93;
  return 0.97;
}

function rateForSentence(text: string, idx: number, total: number, baseRate: number): number {
  if (idx === 0) return baseRate * 0.95;
  if (idx === total - 1) return baseRate * 0.97;
  if (/[!]/.test(text) && text.length < 60) return baseRate * 1.03;
  return baseRate;
}

// ─── AI TTS audio cache ──────────────────────────────────────────────

interface WordTiming {
  word: string;
  start: number;
  end: number;
}

interface CachedAudio {
  audio: HTMLAudioElement;
  wordTimings: WordTiming[];
  ready: boolean;
}

// Cache TTS audio so re-reads don't re-fetch
const audioCache = new Map<string, CachedAudio>();
// Track in-flight fetches to avoid duplicate requests
const fetchingKeys = new Map<string, Promise<CachedAudio | null>>();

// Pre-generated audio data for built-in stories (loaded lazily)
let builtinAudioData: Record<string, { file: string; duration: number; wordTimings: WordTiming[] }[]> | null | undefined = null;
let builtinAudioLoading = false;

async function loadBuiltinAudioData() {
  if (builtinAudioData !== null || builtinAudioLoading) return;
  builtinAudioLoading = true;
  try {
    const mod = await import("@/data/storyAudio.json");
    builtinAudioData = mod.default as Record<string, { file: string; duration: number; wordTimings: WordTiming[] }[]>;
  } catch {
    builtinAudioData = {} as Record<string, { file: string; duration: number; wordTimings: WordTiming[] }[]>;
  }
  builtinAudioLoading = false;
}

function getCacheKey(storyId: string | undefined, pageIdx: number | undefined, text: string, voice: AIVoiceName, _speed: number): string {
  // For built-in stories with nova voice, always use the pre-generated audio
  // (speed is handled via playbackRate, not re-generation)
  if (storyId && pageIdx !== undefined && voice === "nova") {
    return `builtin:${storyId}:${pageIdx}`;
  }
  // Speed is intentionally NOT part of the cache key. All TTS audio is
  // generated at natural speed 1.0; playbackRate handles speed variations
  // at the audio element level. This keeps cache hits stable across reading
  // speed changes and avoids Whisper word-timing drift on stretched audio.
  return `${voice}:${text.slice(0, 120)}`;
}

// Try to load pre-generated audio for a built-in story page
async function loadBuiltinAudio(storyId: string, pageIdx: number): Promise<CachedAudio | null> {
  await loadBuiltinAudioData();
  if (!builtinAudioData || !builtinAudioData[storyId]) return null;

  const pageData = builtinAudioData[storyId][pageIdx];
  if (!pageData || !pageData.file || !pageData.wordTimings?.length) return null;

  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "auto";

    const entry: CachedAudio = {
      audio,
      wordTimings: pageData.wordTimings,
      ready: false,
    };

    let resolved = false;
    const done = (success: boolean) => {
      if (resolved) return;
      resolved = true;
      if (success) {
        entry.ready = true;
        resolve(entry);
      } else {
        resolve(null);
      }
    };

    // Use 'canplay' — enough data to start, don't wait for full buffer
    audio.oncanplay = () => done(true);
    audio.onloadedmetadata = () => done(true);
    audio.onerror = () => done(false);

    // Set source to trigger loading
    audio.src = pageData.file;

    // Handle instant cache hit (browser already has this file)
    if (audio.readyState >= 1) {
      done(true);
    }

    // Short timeout — these are local files, should be fast
    setTimeout(() => {
      if (!resolved) {
        if (audio.readyState >= 1) {
          done(true);
        } else {
          console.warn(`Builtin audio timeout: ${pageData.file}`);
          done(false);
        }
      }
    }, 3000);
  });
}

// Fetch TTS audio from API (for custom stories or non-default voice).
// Always requests speed=1.0 so Whisper word timings are accurate — playback
// speed is applied via audio.playbackRate at play time. (Sending a non-1.0
// speed to OpenAI TTS applies a post-processing stretch that confuses Whisper
// and causes audio-to-text drift.)
async function fetchTTSFromAPI(
  text: string, aiVoice: AIVoiceName, _aiSpeed: number
): Promise<CachedAudio | null> {
  const t0 = performance.now();
  const label = text.slice(0, 30).replace(/\s+/g, " ");
  console.log(`[Audio] fetch start: "${label}..."`);
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: aiVoice, speed: 1.0 }),
    });
    console.log(`[Audio] response received: ${((performance.now() - t0) / 1000).toFixed(1)}s`);

    if (!res.ok) {
      console.warn("TTS API error:", res.status);
      return null;
    }

    const data = await res.json();

    // Convert base64 audio to a blob URL
    const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const blob = new Blob([audioBytes], { type: data.contentType });
    const audioUrl = URL.createObjectURL(blob);

    const audio = new Audio(audioUrl);
    // Force the browser to fully buffer the audio so play() is instant later.
    // Without this (or with only 'loadedmetadata'), readyState stays at 1
    // (HAVE_METADATA) and the first play() has to decode on-demand, adding
    // ~2-3s of dead air before sound starts.
    audio.preload = "auto";

    const entry: CachedAudio = {
      audio,
      wordTimings: data.wordTimings || [],
      ready: false,
    };

    // Wait until the browser has enough decoded data to start playing
    // without buffering. 'canplay' = readyState >= 3 (HAVE_FUTURE_DATA).
    // We also set a safety timeout — if for some reason canplay never fires,
    // we still return after 4s so the call doesn't hang forever.
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = (ready: boolean, reason: string) => {
        if (settled) return;
        settled = true;
        entry.ready = ready;
        console.log(`[Audio] ready: ${ready} (${reason}) total: ${((performance.now() - t0) / 1000).toFixed(1)}s`);
        resolve();
      };
      audio.oncanplay = () => done(true, "canplay");
      audio.oncanplaythrough = () => done(true, "canplaythrough");
      audio.onerror = () => done(false, "error");
      if (audio.readyState >= 3) done(true, "already-ready");
      // Kick the browser to start loading
      try { audio.load(); } catch { /* ignore */ }
      // Safety net: if canplay never fires (rare), don't hang
      setTimeout(() => done(audio.readyState >= 2, `timeout(readyState=${audio.readyState})`), 4000);
    });

    return entry;
  } catch (err) {
    console.warn("TTS fetch failed:", err);
    return null;
  }
}

// Main fetch function: tries built-in first, then API
async function fetchAudio(
  text: string, aiVoice: AIVoiceName, aiSpeed: number,
  storyId?: string, pageIdx?: number
): Promise<CachedAudio | null> {
  const cacheKey = getCacheKey(storyId, pageIdx, text, aiVoice, aiSpeed);

  // Already cached
  const existing = audioCache.get(cacheKey);
  if (existing) return existing;

  // Already fetching
  const inflight = fetchingKeys.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async (): Promise<CachedAudio | null> => {
    try {
      // For built-in stories with nova voice, try pre-generated audio first
      // (speed is handled via playbackRate, not re-generation)
      if (storyId && pageIdx !== undefined && aiVoice === "nova") {
        const builtin = await loadBuiltinAudio(storyId, pageIdx);
        if (builtin) {
          audioCache.set(cacheKey, builtin);
          return builtin;
        }
      }

      // Fall back to API
      const result = await fetchTTSFromAPI(text, aiVoice, aiSpeed);
      if (result) {
        audioCache.set(cacheKey, result);
      }
      return result;
    } finally {
      fetchingKeys.delete(cacheKey);
    }
  })();

  fetchingKeys.set(cacheKey, promise);
  return promise;
}

// ─── Hydrate stored audio ────────────────────────────────────────────
// Seeds the module-level audioCache with CachedAudio entries that point at
// already-persisted mp3 URLs (Supabase Storage) plus their Whisper word
// timings. Called when a saved story opens in the reader. After this runs,
// fetchAudio() / speakAI() will find cache hits on every page that has a
// stored URL and skip /api/tts entirely.
//
// The returned Promise resolves once page 1's audio element has buffered
// enough to play instantly — callers can ignore it for fire-and-forget or
// await it to guarantee zero lag on first play.

interface StoredAudioPage {
  text: string;
  url: string | null;
  wordTimings: WordTiming[] | null;
}

function hydrateCachedAudioEntry(url: string, wordTimings: WordTiming[]): CachedAudio {
  const audio = new Audio(url);
  // Critical: force the browser to decode in the background so the first
  // play() is instant. Without this, readyState stays at 1 (HAVE_METADATA)
  // and play() has to decode on-demand → ~2-3s of dead air.
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";

  const entry: CachedAudio = { audio, wordTimings, ready: false };

  // Start decoding; mark ready on canplay. Not awaited — runs in background.
  const markReady = () => { entry.ready = true; };
  audio.addEventListener("canplay", markReady, { once: true });
  audio.addEventListener("canplaythrough", markReady, { once: true });
  try { audio.load(); } catch { /* ignore */ }

  return entry;
}

export function hydrateStoredAudio(
  pages: StoredAudioPage[],
  voice: AIVoiceName = "nova",
): void {
  for (const page of pages) {
    if (!page.url || !page.wordTimings || page.wordTimings.length === 0) continue;
    if (!page.text) continue;
    // Use the same cache key shape as fetchAudio — speed is NOT part of the
    // key (all audio is at natural 1.0; playbackRate handles variations).
    const cacheKey = `${voice}:${page.text.slice(0, 120)}`;
    // Don't clobber an in-flight or already-fetched entry.
    if (audioCache.has(cacheKey)) continue;
    const entry = hydrateCachedAudioEntry(page.url, page.wordTimings);
    audioCache.set(cacheKey, entry);
  }
}

// ─── Standalone prefetch helper ──────────────────────────────────────
// Call this from outside the hook (e.g. BuilderScreen, library tap handler)
// to warm the audio cache before the reader mounts.
// Uses defaults (nova voice, 1.0 speed) which match the reader's defaults —
// if the user has customized voice/speed in the reader, the reader's own
// prefetch will fire on mount and catch it.
//
// Returns a Promise that resolves when **page 1** is cached (or failed).
// Other pages keep warming in the background. Caller can await this to
// guarantee the user has zero lag when they hit play on page 1, or ignore
// the return value for pure fire-and-forget.
export function prefetchStoryAudio(
  pageTexts: string[],
  storyId?: string,
  options?: { voice?: AIVoiceName; speed?: number; maxPages?: number }
): Promise<void> {
  const voice = options?.voice ?? "nova";
  const speed = options?.speed ?? 1.0;
  // Only warm the first couple of pages — page 1 is the critical one.
  // Warming more than that wastes API calls if the user doesn't finish the story.
  const maxPages = options?.maxPages ?? 2;

  const count = Math.min(pageTexts.length, maxPages);
  let firstPagePromise: Promise<CachedAudio | null> = Promise.resolve(null);

  for (let i = 0; i < count; i++) {
    const text = pageTexts[i];
    if (!text) continue;
    const p = fetchAudio(text, voice, speed, storyId, i);
    // Errors are already swallowed inside fetchAudio, but guard just in case
    p.catch(() => {});
    if (i === 0) firstPagePromise = p;
  }

  return firstPagePromise.then(() => undefined).catch(() => undefined);
}

// ─── Main hook ───────────────────────────────────────────────────────

export function useSpeech(): SpeechControls {
  // Shared state
  const [speaking, setSpeaking] = useState(false);
  const [wordIndex, setWordIndex] = useState(-1);
  const [words, setWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Voice mode: AI or browser
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ai");

  // AI voice settings
  const [aiVoice, setAiVoice] = useState<AIVoiceName>("nova");
  const [aiSpeed, setAiSpeed] = useState(1.0);

  // Browser voice settings
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(0.82);
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Current story context for built-in audio lookup
  const storyContextRef = useRef<{ storyId?: string; pageIdx?: number }>({});

  // Refs
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Load browser voices
  useEffect(() => {
    const l = () => {
      const ev = getEnglishVoices();
      setAllVoices(ev);
      if (!voice && ev.length) setVoice(pickBestVoice(ev));
    };
    l();
    window.speechSynthesis.onvoiceschanged = l;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Eagerly start loading the built-in audio index
  useEffect(() => { loadBuiltinAudioData(); }, []);

  // ─── Stop ─────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    cancelledRef.current = true;

    window.speechSynthesis.cancel();
    if (timerRef.current) clearInterval(timerRef.current);

    if (audioRef.current) {
      // Clear event handlers before pausing to prevent stale callbacks
      audioRef.current.onended = null;
      audioRef.current.onpause = null;
      audioRef.current.onplay = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    setSpeaking(false);
    setWordIndex(-1);
    setLoading(false);
  }, []);

  // ─── Set story context (called by ReaderScreen) ───────────────────

  const setStoryContext = useCallback((storyId?: string, pageIdx?: number) => {
    storyContextRef.current = { storyId, pageIdx };
  }, []);

  // ─── Prefetch ─────────────────────────────────────────────────────

  const prefetch = useCallback((text: string, storyId?: string, pageIdx?: number) => {
    if (voiceMode !== "ai") return;
    fetchAudio(text, aiVoice, aiSpeed, storyId, pageIdx);
  }, [voiceMode, aiVoice, aiSpeed]);

  // ─── AI Voice speak ───────────────────────────────────────────────

  const speakAI = useCallback(async (text: string, onEnd?: () => void) => {
    stop();
    cancelledRef.current = false;

    const allWords = text.split(/\s+/).filter(Boolean);
    setWords(allWords);
    setWordIndex(0);
    setSpeaking(true);
    setLoading(true);

    const { storyId, pageIdx } = storyContextRef.current;
    const playStart = performance.now();
    const cacheKeyDbg = `${aiVoice}:${text.slice(0, 30).replace(/\s+/g, " ")}`;
    const wasCached = audioCache.has(getCacheKey(storyId, pageIdx, text, aiVoice, aiSpeed));
    console.log(`[Audio] speak called, cache ${wasCached ? "HIT" : "MISS"} for: ${cacheKeyDbg}`);
    const cached = await fetchAudio(text, aiVoice, aiSpeed, storyId, pageIdx);
    console.log(`[Audio] fetchAudio returned in ${((performance.now() - playStart) / 1000).toFixed(2)}s, ready=${cached?.ready}`);

    if (cancelledRef.current) return;
    setLoading(false);

    if (!cached || !cached.ready) {
      console.warn("AI audio not available, falling back to browser voice");
      speakBrowser(text, onEnd);
      return;
    }

    // Use the cached audio element directly (reset it for replay).
    //
    // IMPORTANT — defensive reset order. Previously we just set
    // currentTime=0 then called play(). That looks correct, but
    // setting currentTime on an <audio> element is an **async seek**.
    // If the element was previously paused mid-playback (which is
    // exactly what happens when the user flips pages: stop() called
    // pause() and then set currentTime=0, but the seek is queued),
    // AND the element isn't fully buffered yet, the subsequent play()
    // can race the seek and start playback from the old currentTime
    // instead of 0. User experience: "audio skips ahead mid-page"
    // when flipping pages quickly then hitting play.
    //
    // Fix:
    //   1. Explicit pause() before anything else, so the internal
    //      playback state is quiesced before we touch currentTime.
    //   2. Set currentTime=0.
    //   3. Await a microtask (Promise.resolve) so the seek starts
    //      processing before play() is called. In practice this one
    //      tick is enough for the browser to latch the new seek
    //      target; combined with the pause() above it reliably
    //      starts playback from the beginning.
    const audio = cached.audio;
    // Clear any old event listeners by replacing with fresh ones below
    audio.onplay = null;
    audio.onended = null;
    audio.onpause = null;
    audio.onerror = null;
    try { audio.pause(); } catch { /* ignore */ }
    audio.currentTime = 0;
    audio.playbackRate = aiSpeed;
    audioRef.current = audio;
    // Yield one microtask so the seek request is latched before play()
    await Promise.resolve();
    if (cancelledRef.current) return;

    const timings = cached.wordTimings;
    let endHandled = false;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
    };

    const handleEnd = () => {
      if (endHandled || cancelledRef.current) return;
      endHandled = true;
      cleanup();
      setSpeaking(false);
      setWordIndex(-1);
      onEnd?.();
    };

    // Word highlighting alignment.
    //
    // Whisper's word array and our display word array don't always count the
    // same number of items — Whisper sometimes splits punctuation into its
    // own token ("mat", "."), while the display splits the raw text on
    // whitespace and gets a single "mat." token. Previously we compensated
    // with linear scaling (Math.round(preciseIdx / timingsLen * displayLen))
    // but that formula introduced a systematic ~1-word lag in the middle of
    // sentences whenever Whisper had more tokens, producing the "audio ahead
    // of highlighted words" bug.
    //
    // Fix: precompute a direct mapping from Whisper token index → display
    // word index by aligning characters. We strip everything but letters and
    // digits from both sides, then walk the concatenated streams and assign
    // each Whisper token to whichever display word's character range it
    // falls into. This is O(n) once at play-start, and the hot loop is then
    // just an array lookup with no rounding — so whatever Whisper says, that
    // word is what we highlight.
    const timingsLen = timings.length;
    const displayLen = allWords.length;
    const timingToDisplay: number[] = new Array(timingsLen);
    {
      // Char-offset where each display word's "clean" letters begin.
      const displayStarts: number[] = new Array(displayLen);
      let pos = 0;
      for (let i = 0; i < displayLen; i++) {
        displayStarts[i] = pos;
        pos += allWords[i].replace(/[^\p{L}\p{N}]/gu, "").length;
      }
      // Walk Whisper tokens accumulating chars; assign each to the display
      // word whose range contains the cursor. Punctuation-only Whisper
      // tokens contribute 0 chars and should *stay* on the previous display
      // word (because visually the comma belongs with the word before it).
      // To enforce that, we only advance `di` when the current token has
      // real letter/digit content — otherwise a 0-char token sitting on an
      // equality boundary would jump the highlight one word early.
      let cursor = 0;
      let di = 0;
      for (let i = 0; i < timingsLen; i++) {
        const cleanLen = (timings[i].word || "").replace(/[^\p{L}\p{N}]/gu, "").length;
        if (cleanLen > 0) {
          while (di + 1 < displayLen && displayStarts[di + 1] <= cursor) di++;
        }
        timingToDisplay[i] = di;
        cursor += cleanLen;
      }
    }

    const trackWords = () => {
      if (cancelledRef.current || endHandled) return;

      // Check if audio naturally ended (backup for browsers that miss 'ended' event)
      if (audio.ended) {
        handleEnd();
        return;
      }

      // Update word highlight if audio is playing
      if (!audio.paused) {
        const currentTime = audio.currentTime;

        // Find the last Whisper token whose start has been reached. Note:
        // audio.currentTime advances in the audio's own timeline regardless
        // of playbackRate, and Whisper timings were computed at 1.0 speed,
        // so this stays correct whether we're playing at 0.85, 0.92, or 1.0.
        let whisperIdx = 0;
        for (let i = 0; i < timingsLen; i++) {
          if (currentTime >= timings[i].start) {
            whisperIdx = i;
          } else {
            break;
          }
        }

        const displayIdx = timingsLen === 0 ? 0 : timingToDisplay[whisperIdx];
        setWordIndex(Math.min(Math.max(displayIdx, 0), displayLen - 1));
      }

      // Always keep the loop running — don't stop on momentary pauses/buffering
      animFrameRef.current = requestAnimationFrame(trackWords);
    };

    audio.onended = handleEnd;

    audio.onerror = () => {
      cleanup();
      if (!cancelledRef.current && !endHandled) {
        endHandled = true;
        setSpeaking(false);
        console.warn("Audio error, falling back to browser voice");
        speakBrowser(text, onEnd);
      }
    };

    try {
      await audio.play();
    } catch (err) {
      console.warn("Audio play failed:", err);
      cleanup();
      if (!cancelledRef.current && !endHandled) {
        endHandled = true;
        setSpeaking(false);
        speakBrowser(text, onEnd);
      }
      return;
    }

    if (cancelledRef.current || endHandled) return;

    // Start the tracking loop only after playback has begun
    animFrameRef.current = requestAnimationFrame(trackWords);

    // Safety timeout — if audio should be done but 'ended' event never fires
    const dur = audio.duration || 0;
    if (dur > 0) {
      const expectedMs = (dur / aiSpeed + 8) * 1000;
      safetyTimer = setTimeout(() => {
        if (!endHandled && !cancelledRef.current) {
          console.warn("Audio safety timeout — forcing end");
          handleEnd();
        }
      }, expectedMs);
    }
  }, [aiVoice, aiSpeed, stop]);

  // ─── Browser Voice speak ──────────────────────────────────────────

  const speakBrowser = useCallback((text: string, onEnd?: () => void) => {
    cancelledRef.current = false;

    const { allWords, sentences } = splitSentences(text);
    setWords(allWords);
    setWordIndex(0);
    setSpeaking(true);

    let sentIdx = 0;

    const speakNext = () => {
      if (cancelledRef.current) return;
      if (sentIdx >= sentences.length) {
        setSpeaking(false);
        setWordIndex(-1);
        onEnd?.();
        return;
      }

      const sent = sentences[sentIdx];
      const sentWords = sent.text.split(/\s+/).filter(Boolean);
      const utt = new SpeechSynthesisUtterance(sent.text);
      if (voice) utt.voice = voice;
      utt.rate = rateForSentence(sent.text, sentIdx, sentences.length, rate);
      utt.pitch = pitchForSentence(sent.text);

      let bFired = false;
      let lastHighlight = sent.startIdx;
      setWordIndex(sent.startIdx);

      utt.onboundary = (e) => {
        if (cancelledRef.current) return;
        if (e.name === "word") {
          bFired = true;
          if (timerRef.current) clearInterval(timerRef.current);
          let ci = e.charIndex, wIdx = 0, pos = 0;
          for (let w = 0; w < sentWords.length; w++) {
            if (pos >= ci) { wIdx = w; break; }
            pos += sentWords[w].length + 1;
            wIdx = w + 1;
          }
          const globalIdx = Math.min(sent.startIdx + Math.min(wIdx, sentWords.length - 1), sent.endIdx);
          if (globalIdx >= lastHighlight) {
            lastHighlight = globalIdx;
            setWordIndex(globalIdx);
          }
        }
      };

      const ms = 60000 / (150 * utt.rate);
      let tIdx = 0;
      timerRef.current = setInterval(() => {
        if (bFired || cancelledRef.current) {
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }
        tIdx++;
        const gi = Math.min(sent.startIdx + tIdx, sent.endIdx);
        setWordIndex(gi);
      }, ms);

      utt.onend = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (cancelledRef.current) return;
        setWordIndex(sent.endIdx);
        sentIdx++;
        const pauseMs = sent.text.endsWith("?") ? 380 : sent.text.endsWith("!") ? 350 : 420;
        setTimeout(speakNext, pauseMs);
      };

      utt.onerror = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (!cancelledRef.current) {
          setSpeaking(false);
          setWordIndex(-1);
        }
      };

      window.speechSynthesis.speak(utt);
    };

    speakNext();
  }, [voice, rate]);

  // ─── Unified speak ────────────────────────────────────────────────

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (voiceMode === "ai") {
      speakAI(text, onEnd);
    } else {
      stop();
      cancelledRef.current = false;
      speakBrowser(text, onEnd);
    }
  }, [voiceMode, speakAI, speakBrowser, stop]);

  // Cleanup on unmount
  useEffect(() => () => {
    stop();
    audioCache.forEach((c) => {
      if (c.audio.src.startsWith("blob:")) URL.revokeObjectURL(c.audio.src);
    });
    audioCache.clear();
  }, [stop]);

  return {
    speaking, wordIndex, words, speak, stop, loading, prefetch,
    voiceMode, setVoiceMode,
    aiVoice, setAiVoice, aiSpeed, setAiSpeed,
    voice, setVoice, rate, setRate, allVoices,
    setStoryContext,
  };
}
