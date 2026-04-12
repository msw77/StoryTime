"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sentence, SpeechControls } from "@/types/story";

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

export function useSpeech(): SpeechControls {
  const [speaking, setSpeaking] = useState(false);
  const [wordIndex, setWordIndex] = useState(-1);
  const [words, setWords] = useState<string[]>([]);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(0.82);
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const stop = useCallback(() => {
    cancelledRef.current = true;
    window.speechSynthesis.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    setSpeaking(false);
    setWordIndex(-1);
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    stop();
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
  }, [voice, rate, stop]);

  return { speaking, wordIndex, words, speak, stop, voice, setVoice, rate, setRate, allVoices };
}
