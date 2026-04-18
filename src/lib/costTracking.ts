// Shared logger for every outbound paid API call. Each provider wrapper
// (anthropic.ts, fal.ts, tts.ts) hands us the raw usage numbers pulled
// from the provider's response, plus a category describing what triggered
// the call. We compute cost_cents here using the centralized pricing
// table, then fire-and-forget an insert into api_usage.
//
// Writes are non-blocking and swallow errors on purpose — a failure to
// log costs must never break a user's story generation. The returned
// promise resolves when the insert completes (or fails silently); callers
// don't need to await it.

import { createServiceClient } from "@/lib/supabase";
import {
  anthropicCostCents,
  falImageCostCents,
  openAiTtsCostCents,
  openAiWhisperCostCents,
} from "@/lib/costPricing";

export type UsageCategory =
  | "user-story"        // end-user generated a custom story
  | "user-image"        // end-user triggered an image regeneration
  | "user-audio"        // end-user triggered TTS for a story page
  | "word-audio"        // Sound It Out — per-word TTS via /api/tts-word
  | "classic-generation" // batch script generating a classic story
  | "reading-science-enrich" // enrich-stories-vocab metadata pass
  | "brand-asset"       // one-off asset (logo, hero illustration)
  | "admin"             // admin-triggered, bucketed separately
  | "unknown";

interface BaseLogInput {
  category?: UsageCategory;
  userId?: string | null;
  storyId?: string | null;
  metadata?: Record<string, unknown>;
}

interface AnthropicLogInput extends BaseLogInput {
  provider: "anthropic";
  operation: "story-generation" | string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface OpenAiTtsLogInput extends BaseLogInput {
  provider: "openai";
  operation: "tts";
  model: string;
  inputChars: number;
}

interface OpenAiWhisperLogInput extends BaseLogInput {
  provider: "openai";
  operation: "whisper";
  audioSeconds: number;
}

interface FalImageLogInput extends BaseLogInput {
  provider: "fal";
  operation: "image-generation";
  model: string;
  imagesGenerated: number;
}

export type LogInput =
  | AnthropicLogInput
  | OpenAiTtsLogInput
  | OpenAiWhisperLogInput
  | FalImageLogInput;

/**
 * Log a single API call to the `api_usage` table. Fire-and-forget —
 * failures are swallowed and logged to console rather than bubbling up
 * into the caller's error path. The caller doesn't need to await.
 */
export function logApiUsage(input: LogInput): void {
  // Wrapped in an IIFE so we can start the write without blocking the
  // caller's event loop.
  void (async () => {
    try {
      const cost = computeCostCents(input);
      const supabase = createServiceClient();
      const row: Record<string, unknown> = {
        provider: input.provider,
        operation: input.operation,
        category: input.category ?? "unknown",
        cost_cents: cost,
        user_id: input.userId ?? null,
        story_id: input.storyId ?? null,
        metadata: input.metadata ?? null,
      };
      if ("model" in input && input.model) row.model = input.model;
      if ("inputTokens" in input)   row.input_tokens   = input.inputTokens;
      if ("outputTokens" in input)  row.output_tokens  = input.outputTokens;
      if ("inputChars" in input)    row.input_chars    = input.inputChars;
      if ("audioSeconds" in input)  row.audio_seconds  = input.audioSeconds;
      if ("imagesGenerated" in input) row.images_generated = input.imagesGenerated;

      const { error } = await supabase.from("api_usage").insert(row);
      if (error) {
        console.warn("[costTracking] insert failed:", error.message);
      }
    } catch (err) {
      console.warn("[costTracking] unexpected error:", err);
    }
  })();
}

function computeCostCents(input: LogInput): number {
  switch (input.provider) {
    case "anthropic":
      return anthropicCostCents(input.model, input.inputTokens, input.outputTokens);
    case "openai":
      if (input.operation === "tts") {
        return openAiTtsCostCents(input.model, input.inputChars);
      }
      if (input.operation === "whisper") {
        return openAiWhisperCostCents(input.audioSeconds);
      }
      return 0;
    case "fal":
      return falImageCostCents(input.model, input.imagesGenerated);
    default:
      return 0;
  }
}
