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

function getCacheKey(storyId: string | undefined, pageIdx: number | undefined, text: string, voice: AIVoiceName, speed: number): string {
  // For built-in stories with nova voice, always use the pre-generated audio
  // (speed is handled via playbackRate, not re-generation)
  if (storyId && pageIdx !== undefined && voice === "nova") {
    return `builtin:${storyId}:${pageIdx}`;
  }
  return `${voice}:${speed.toFixed(1)}:${text.slice(0, 120)}`;
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

// Fetch TTS audio from API (for custom stories or non-default voice)
async function fetchTTSFromAPI(
  text: string, aiVoice: AIVoiceName, aiSpeed: number
): Promise<CachedAudio | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: aiVoice, speed: aiSpeed }),
    });

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

    const entry: CachedAudio = {
      audio,
      wordTimings: data.wordTimings || [],
      ready: false,
    };

    await new Promise<void>((resolve) => {
      audio.onloadedmetadata = () => {
        entry.ready = true;
        resolve();
      };
      audio.onerror = () => resolve();
      if (audio.readyState >= 1) {
        entry.ready = true;
        resolve();
      }
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
    const cached = await fetchAudio(text, aiVoice, aiSpeed, storyId, pageIdx);

    if (cancelledRef.current) return;
    setLoading(false);

    if (!cached || !cached.ready) {
      console.warn("AI audio not available, falling back to browser voice");
      speakBrowser(text, onEnd);
      return;
    }

    // Use the cached audio element directly (reset it for replay)
    const audio = cached.audio;
    // Clear any old event listeners by replacing with fresh ones below
    audio.onplay = null;
    audio.onended = null;
    audio.onpause = null;
    audio.onerror = null;
    audio.currentTime = 0;
    audio.playbackRate = aiSpeed;
    audioRef.current = audio;

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

    // Word highlighting with Whisper timestamps, scaled to match display word count
    const timingsLen = timings.length;
    const displayLen = allWords.length;

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

        // Find current position in Whisper's timing array
        let whisperIdx = 0;
        for (let i = 0; i < timingsLen; i++) {
          if (currentTime >= timings[i].start) {
            whisperIdx = i;
          }
        }

        // Scale Whisper index to display word index when counts differ
        // e.g., if Whisper has 48 words and display has 52, scale proportionally
        let displayIdx: number;
        if (timingsLen === displayLen || timingsLen === 0) {
          displayIdx = whisperIdx;
        } else {
          // Also factor in fractional position within the current word's time span
          const wordStart = timings[whisperIdx].start;
          const wordEnd = timings[whisperIdx].end ||
            (whisperIdx + 1 < timingsLen ? timings[whisperIdx + 1].start : audio.duration);
          const wordProgress = wordEnd > wordStart
            ? Math.min((currentTime - wordStart) / (wordEnd - wordStart), 1)
            : 0;
          const preciseIdx = whisperIdx + wordProgress;
          displayIdx = Math.round((preciseIdx / timingsLen) * displayLen);
        }

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
