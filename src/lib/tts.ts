import OpenAI from "openai";
import { writeFileSync, createReadStream, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { logApiUsage } from "@/lib/costTracking";

// Shared TTS + Whisper helper used by /api/tts (one-shot preview) and
// /api/stories (persistent save). Always generates audio at natural speed
// 1.0 — client-side playbackRate handles speed variations. Generating at
// non-1.0 speed caused Whisper word-timing drift; see src/hooks/useSpeech.ts.

export type TtsVoice = "nova" | "alloy" | "echo" | "fable" | "onyx" | "shimmer";
export const VALID_VOICES: TtsVoice[] = ["nova", "alloy", "echo", "fable", "onyx", "shimmer"];

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface TtsResult {
  /** Raw mp3 bytes */
  audioBuffer: Buffer;
  /** Word-level timestamps from Whisper (or evenly-distributed fallback) */
  wordTimings: WordTiming[];
  /** Audio duration in seconds (from Whisper) */
  duration: number;
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_TTS_KEY;
  if (!apiKey) throw new Error("OPENAI_TTS_KEY not set");
  return new OpenAI({ apiKey });
}

/**
 * Generate TTS audio + Whisper word timestamps for a single page of text.
 *
 * Always uses speed 1.0 — don't change this without reading the comment in
 * useSpeech.ts. Speed variations must be applied via audio.playbackRate on
 * the client side, otherwise Whisper timing accuracy degrades.
 */
export async function generateTtsWithTimings(
  text: string,
  voice: TtsVoice = "nova",
): Promise<TtsResult> {
  if (!text || typeof text !== "string") {
    throw new Error("generateTtsWithTimings: text is required");
  }

  const selectedVoice: TtsVoice = VALID_VOICES.includes(voice) ? voice : "nova";
  const openai = getClient();

  // Step 1: Generate TTS audio
  const ttsModel = "tts-1";
  const ttsResponse = await openai.audio.speech.create({
    model: ttsModel,
    voice: selectedVoice,
    input: text,
    speed: 1.0,
    response_format: "mp3",
  });

  const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());

  // Fire-and-forget TTS cost logging (charged per input character).
  logApiUsage({
    provider: "openai",
    operation: "tts",
    model: ttsModel,
    inputChars: text.length,
    category: "user-audio",
  });

  // Step 2: Run Whisper for precise word timestamps.
  // Write to a tempfile so we can use createReadStream (most reliable path
  // through the OpenAI SDK's file-upload handling).
  const tmpPath = join(tmpdir(), `storytime_tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
  let wordTimings: WordTiming[] = [];
  let duration = 0;

  try {
    writeFileSync(tmpPath, audioBuffer);

    const whisperResponse = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: createReadStream(tmpPath),
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    // Whisper is priced per audio minute. duration is in seconds in the
    // verbose_json response; costTracking converts to cents.
    logApiUsage({
      provider: "openai",
      operation: "whisper",
      audioSeconds: whisperResponse.duration ?? 0,
      category: "user-audio",
    });

    wordTimings = (whisperResponse.words || []).map((w) => ({
      word: w.word,
      start: Math.round(w.start * 1000) / 1000,
      end: Math.round(w.end * 1000) / 1000,
    }));
    duration = whisperResponse.duration || 0;
  } catch (whisperErr) {
    console.warn("Whisper failed, using fallback timing:", whisperErr);
    // Fallback: even distribution across the audio duration
    const words = text.split(/\s+/).filter(Boolean);
    const estDuration = (audioBuffer.length * 8) / 24000;
    duration = estDuration;
    let t = 0.08;
    const timePerWord = (estDuration - 0.16) / Math.max(words.length, 1);
    wordTimings = words.map((w) => {
      const entry = { word: w, start: t, end: t + timePerWord };
      t += timePerWord;
      return entry;
    });
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }

  return { audioBuffer, wordTimings, duration };
}
