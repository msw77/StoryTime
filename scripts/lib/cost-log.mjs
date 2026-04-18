/**
 * Cost logging for batch scripts. Parallels src/lib/costTracking.ts and
 * src/lib/costPricing.ts but as .mjs so the generation / cleanup scripts
 * in this folder can import it without a TS build step.
 *
 * Usage:
 *   import { logApiUsage } from "./lib/cost-log.mjs";
 *   await logApiUsage({
 *     provider: "anthropic",
 *     operation: "story-generation",
 *     model: "claude-opus-4-7",
 *     inputTokens: 2800,
 *     outputTokens: 1600,
 *     category: "classic-generation",
 *   });
 *
 * Writes to the same `api_usage` table the live app uses, so the admin
 * dashboard shows batch-script spend alongside in-app spend without any
 * extra wiring.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ── Pricing table (mirrors src/lib/costPricing.ts) ───────────────────
// Cents per 1M tokens for Anthropic models.
const ANTHROPIC_PRICING = {
  "claude-opus-4-7":        { inputPer1M: 1500, outputPer1M: 7500 },
  "claude-opus-4":          { inputPer1M: 1500, outputPer1M: 7500 },
  "claude-sonnet-4-7":      { inputPer1M: 300,  outputPer1M: 1500 },
  "claude-sonnet-4-6":      { inputPer1M: 300,  outputPer1M: 1500 },
  "claude-3-7-sonnet":      { inputPer1M: 300,  outputPer1M: 1500 },
  "claude-sonnet-4-20250514": { inputPer1M: 300, outputPer1M: 1500 },
  "claude-haiku-4-5":       { inputPer1M: 80,   outputPer1M: 400  },
};

// Cents per 1M chars for OpenAI TTS.
const OPENAI_TTS_PRICING = {
  "tts-1":            { charsPer1M: 1500 },
  "tts-1-hd":         { charsPer1M: 3000 },
  "gpt-4o-mini-tts":  { charsPer1M: 60   },
};

// Whisper: $0.006/min → 0.01 cents/sec.
const OPENAI_WHISPER_PER_SECOND_CENTS = 0.01;

// Cents per image for fal models.
const FAL_PRICING = {
  "fal-ai/imagen4/preview/fast":   { perImageCents: 4  },
  "fal-ai/imagen4/preview":        { perImageCents: 8  },
  "fal-ai/nano-banana-2":          { perImageCents: 8  },
  "fal-ai/nano-banana-2/edit":     { perImageCents: 8  },
  "fal-ai/flux/schnell":           { perImageCents: 1  },
  "fal-ai/flux/pro":               { perImageCents: 5  },
};

function computeCostCents(input) {
  switch (input.provider) {
    case "anthropic": {
      const rates = ANTHROPIC_PRICING[input.model];
      if (!rates) return 0;
      const inC = ((input.inputTokens || 0) * rates.inputPer1M) / 1_000_000;
      const outC = ((input.outputTokens || 0) * rates.outputPer1M) / 1_000_000;
      return Math.ceil(inC + outC);
    }
    case "openai": {
      if (input.operation === "tts") {
        const rates = OPENAI_TTS_PRICING[input.model];
        if (!rates) return 0;
        return Math.ceil(((input.inputChars || 0) * rates.charsPer1M) / 1_000_000);
      }
      if (input.operation === "whisper") {
        return Math.ceil((input.audioSeconds || 0) * OPENAI_WHISPER_PER_SECOND_CENTS);
      }
      return 0;
    }
    case "fal": {
      const rates = FAL_PRICING[input.model];
      if (!rates) return 0;
      return rates.perImageCents * (input.imagesGenerated || 0);
    }
    default:
      return 0;
  }
}

// ── Supabase client (lazy) ──────────────────────────────────────────
// Cached so repeated calls within one script run reuse the connection.
let _supabase = null;
function getClient() {
  if (_supabase) return _supabase;
  // Resolve .env.local relative to this file so scripts can run from
  // any cwd. __dirname polyfill for ESM.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const envPath = join(__dirname, "..", "..", ".env.local");
  let url, key;
  try {
    const env = readFileSync(envPath, "utf-8");
    url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
    key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();
  } catch {
    return null;
  }
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * Log a single batch-script API call to the shared `api_usage` table.
 * Fire-and-forget semantics: failures are logged to stderr and swallowed
 * so cost tracking can never break a generation run.
 *
 * Awaiting the returned promise is optional — it lets you sequence a
 * final flush at the end of a script if you want accurate timing.
 */
export async function logApiUsage(input) {
  try {
    const supabase = getClient();
    if (!supabase) return;
    const cost = computeCostCents(input);
    const row = {
      provider: input.provider,
      operation: input.operation,
      category: input.category ?? "batch",
      cost_cents: cost,
      metadata: input.metadata ?? null,
    };
    if (input.model)           row.model            = input.model;
    if (input.inputTokens)     row.input_tokens     = input.inputTokens;
    if (input.outputTokens)    row.output_tokens    = input.outputTokens;
    if (input.inputChars)      row.input_chars      = input.inputChars;
    if (input.audioSeconds)    row.audio_seconds    = input.audioSeconds;
    if (input.imagesGenerated) row.images_generated = input.imagesGenerated;

    const { error } = await supabase.from("api_usage").insert(row);
    if (error) {
      console.warn(`[cost-log] insert failed: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[cost-log] unexpected error: ${err?.message || err}`);
  }
}
