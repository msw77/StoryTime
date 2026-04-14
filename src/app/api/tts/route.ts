import { NextResponse } from "next/server";
import { generateTtsWithTimings } from "@/lib/tts";
import { parseJsonBody, requireClerkUser } from "@/lib/api-helpers";
import { ttsSchema } from "@/lib/schemas";

// POST /api/tts — generate speech audio + Whisper word timestamps for a
// single page of text. One-shot preview; not persisted. Saved stories go
// through /api/stories which persists to Supabase Storage.
//
// Authenticated-only: this route calls OpenAI TTS + Whisper (paid) on every
// request. Without auth an attacker could drive unbounded spend by scripting
// requests. The zod schema also caps payload length so a single request
// can't burn a huge amount of budget by itself.
export async function POST(req: Request) {
  try {
    const clerk = await requireClerkUser();
    if (!clerk.ok) return clerk.response;

    const parsed = await parseJsonBody(req, ttsSchema);
    if (!parsed.ok) return parsed.response;
    const { text, voice = "nova" } = parsed.value;

    const { audioBuffer, wordTimings, duration } = await generateTtsWithTimings(
      text,
      voice,
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
