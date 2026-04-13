import OpenAI from "openai";
import { NextResponse } from "next/server";
import { writeFileSync, createReadStream, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Available OpenAI TTS voices — "nova" is warm and great for kids
const VALID_VOICES = ["nova", "alloy", "echo", "fable", "onyx", "shimmer"] as const;
type Voice = (typeof VALID_VOICES)[number];

function getClient() {
  const apiKey = process.env.OPENAI_TTS_KEY;
  if (!apiKey) throw new Error("OPENAI_TTS_KEY not set");
  return new OpenAI({ apiKey });
}

// POST /api/tts — generate speech audio + Whisper word timestamps
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, voice = "nova", speed = 1.0 } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const selectedVoice: Voice = VALID_VOICES.includes(voice) ? voice : "nova";
    const openai = getClient();

    // Step 1: Generate TTS audio
    const ttsResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: selectedVoice,
      input: text,
      speed: Math.max(0.25, Math.min(4.0, speed)),
      response_format: "mp3",
    });

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());

    // Step 2: Run Whisper for precise word timestamps
    // Write to temp file so we can use createReadStream (most reliable with OpenAI SDK)
    const tmpPath = join(tmpdir(), `storytime_tts_${Date.now()}.mp3`);
    let wordTimings: { word: string; start: number; end: number }[] = [];
    let duration = 0;

    try {
      writeFileSync(tmpPath, audioBuffer);

      const whisperResponse = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: createReadStream(tmpPath),
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
      });

      wordTimings = (whisperResponse.words || []).map((w) => ({
        word: w.word,
        start: Math.round(w.start * 1000) / 1000,
        end: Math.round(w.end * 1000) / 1000,
      }));
      duration = whisperResponse.duration || 0;
    } catch (whisperErr) {
      console.warn("Whisper failed, using fallback timing:", whisperErr);
      // Fallback: even distribution
      const words = text.split(/\s+/).filter(Boolean);
      const estDuration = audioBuffer.length * 8 / 24000;
      duration = estDuration;
      let t = 0.08;
      const timePerWord = (estDuration - 0.16) / words.length;
      wordTimings = words.map((w) => {
        const entry = { word: w, start: t, end: t + timePerWord };
        t += timePerWord;
        return entry;
      });
    } finally {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }

    return NextResponse.json({
      audio: audioBuffer.toString("base64"),
      contentType: "audio/mpeg",
      wordTimings,
      duration,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "TTS generation failed";
    console.error("TTS error:", message);

    if (message.includes("OPENAI_TTS_KEY")) {
      return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
