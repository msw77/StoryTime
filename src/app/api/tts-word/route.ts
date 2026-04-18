import { NextResponse } from "next/server";
import { parseJsonBody, requireDbUserId } from "@/lib/api-helpers";
import { logApiUsage } from "@/lib/costTracking";
import { z } from "zod";
import OpenAI from "openai";

// POST /api/tts-word — generate single-word (or single-syllable) TTS
// audio on demand. Powers the "Sound It Out" Science-of-Reading
// feature (Pillars 1 + 2: phonemic awareness + phonics): the child
// taps any word in the reader and hears it pronounced.
//
// Returns audio as base64 so the client can blob-URL it and cache
// forever. Whisper is NOT called — we don't need word timings on a
// single word/syllable.
//
// Rate consideration: kids tap a lot. Client-side cache (one Map
// entry per word) is mandatory. Each call is ~120 TTS chars at
// most (single word + a tiny pad), which is cheap but adds up on a
// chatty kid.
const ttsWordSchema = z.object({
  word: z.string().min(1).max(60),
  // "nova" is the default read-along voice; no need to support others
  // at this endpoint yet. Kept in the schema for future flex.
  voice: z.enum(["nova", "alloy", "echo", "fable", "onyx", "shimmer"]).default("nova"),
  // Slightly slower than natural narration so syllables land clearly.
  // 0.85x felt more pedagogical in quick tests.
  speed: z.number().min(0.5).max(1.5).default(0.85),
});

export async function POST(req: Request) {
  try {
    // Gate on user auth — unauthenticated calls would leak free TTS.
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;

    const parsed = await parseJsonBody(req, ttsWordSchema);
    if (!parsed.ok) return parsed.response;
    const { word, voice, speed } = parsed.value;

    const apiKey = process.env.OPENAI_TTS_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_TTS_KEY not configured" },
        { status: 500 },
      );
    }
    const openai = new OpenAI({ apiKey });

    const ttsResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: word,
      speed,
      response_format: "mp3",
    });

    // Fire-and-forget cost log. Category "word-audio" distinguishes
    // these many-small-calls from the per-page narration so the
    // dashboard can see the unit-economics side of Sound It Out.
    logApiUsage({
      provider: "openai",
      operation: "tts",
      model: "tts-1",
      inputChars: word.length,
      category: "word-audio",
      metadata: { voice },
    });

    const arrayBuffer = await ttsResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return NextResponse.json({
      audio: base64,
      contentType: "audio/mpeg",
      word,
    });
  } catch (err) {
    console.error("tts-word POST error:", err);
    return NextResponse.json({ error: "tts failed" }, { status: 500 });
  }
}
