"use client";

import { useCallback, useRef, useEffect } from "react";

// ─── Web Audio context (shared, created once) ────────────────────────

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume if suspended (browsers require user gesture)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// ─── Sound generators ────────────────────────────────────────────────

function playPageTurn() {
  const ctx = getCtx();
  const duration = 0.18;
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  // Very soft, breathy whisper of noise — barely there
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    // Gentle bell curve envelope
    const env = Math.sin(t * Math.PI);
    data[i] = (Math.random() * 2 - 1) * env;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Highpass — only the airy top end
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3000;

  // Lowpass — cut harshness
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;

  const gain = ctx.createGain();
  // Halved from 0.04 — parent tester said the page-turn whoosh was a
  // touch loud relative to narration. Keep it just audible as feedback.
  gain.gain.setValueAtTime(0.02, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  source.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

function playTap() {
  const ctx = getCtx();

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}

function playCelebration() {
  const ctx = getCtx();
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    const startTime = ctx.currentTime + i * 0.12;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.1, startTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.45);
  });
}

function playStarTap(starIndex: number) {
  const ctx = getCtx();
  // Ascending pentatonic scale — feels rewarding
  const notes = [523, 587, 659, 784, 880]; // C5, D5, E5, G5, A5
  const freq = notes[Math.min(starIndex, notes.length - 1)];

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.35);
}

function playStartReading() {
  const ctx = getCtx();
  // Gentle two-note chime — signals "let's begin"
  const notes = [440, 554]; // A4, C#5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    const t = ctx.currentTime + i * 0.1;
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

// ─── Hook ────────────────────────────────────────────────────────────

export interface SoundEffects {
  pageTurn: () => void;
  tap: () => void;
  celebration: () => void;
  starTap: (index: number) => void;
  startReading: () => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

export function useSoundEffects(): SoundEffects {
  const enabledRef = useRef(true);

  // Try to read saved preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("storytime-sfx");
      if (saved === "off") enabledRef.current = false;
    } catch {}
  }, []);

  const pageTurn = useCallback(() => {
    if (enabledRef.current) playPageTurn();
  }, []);

  const tap = useCallback(() => {
    if (enabledRef.current) playTap();
  }, []);

  const celebration = useCallback(() => {
    if (enabledRef.current) playCelebration();
  }, []);

  const starTap = useCallback((index: number) => {
    if (enabledRef.current) playStarTap(index);
  }, []);

  const startReading = useCallback(() => {
    if (enabledRef.current) playStartReading();
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    enabledRef.current = v;
    try { localStorage.setItem("storytime-sfx", v ? "on" : "off"); } catch {}
  }, []);

  return {
    pageTurn, tap, celebration, starTap, startReading,
    enabled: enabledRef.current, setEnabled,
  };
}
