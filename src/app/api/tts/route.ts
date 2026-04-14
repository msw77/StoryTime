import { NextResponse } from "next/server";
import { generateTtsWithTimings, VALID_VOICES, TtsVoice } from "@/lib/tts";

// POST /api/tts — generate speech audio + Whisper word timestamps for a
// single page of text. One-shot preview; not persisted. Saved stories go
// through /api/stories which persists to Supabase Storage.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, voice = "nova" } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
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
