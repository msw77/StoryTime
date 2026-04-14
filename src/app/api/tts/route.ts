import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateTtsWithTimings, VALID_VOICES, TtsVoice } from "@/lib/tts";

// Hard cap on per-request text length. Nova TTS bills per character and
// Whisper transcription is O(audio_duration), so a malicious client sending
// book-length payloads could burn real money. Normal story pages are 100-300
// chars; 2000 leaves slack for long-form content but prevents abuse.
const MAX_TTS_TEXT_LENGTH = 2000;

// POST /api/tts — generate speech audio + Whisper word timestamps for a
// single page of text. One-shot preview; not persisted. Saved stories go
// through /api/stories which persists to Supabase Storage.
//
// Authenticated-only: this route calls OpenAI TTS + Whisper (paid) on every
// request. Without auth an attacker could drive unbounded spend by scripting
// requests. All callers must be signed-in Clerk users.
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json();
    const { text, voice = "nova" } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    if (text.length > MAX_TTS_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text too long (max ${MAX_TTS_TEXT_LENGTH} chars)` },
        { status: 413 },
      );
    }

    const selectedVoice: TtsVoice = VALID_VOICES.includes(voice as TtsVoice)
      ? (voice as TtsVoice)
      : "nova";

    const { audioBuffer, wordTimings, duration } = await generateTtsWithTimings(
      text,
      selectedVoice,
    );

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
