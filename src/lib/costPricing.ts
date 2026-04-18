// Cost-tracking pricing reference. All rates are in cents ($0.01 units)
// and are stored here so the logging helper can compute cost_cents at
// call time. When a provider changes pricing, update this file and
// (optionally) re-run a recompute pass against historical api_usage rows
// using the captured raw units (tokens, chars, seconds, images).
//
// Sources:
//   Anthropic:  https://www.anthropic.com/pricing
//   OpenAI:     https://openai.com/api/pricing (TTS + Whisper sections)
//   fal.ai:     per-model pricing on each model's docs page

export type Provider = "anthropic" | "openai" | "fal";

// ── Anthropic ────────────────────────────────────────────────────────
// Claude API rates per 1M tokens (input/output), converted to cents.
//
// 1M input tokens at $15 = 1500 cents → 0.0015 cents/token.
// We store the rate per-1M so integer math is easier.
export const ANTHROPIC_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-opus-4-7":        { inputPer1M: 1500, outputPer1M: 7500 },
  "claude-opus-4":          { inputPer1M: 1500, outputPer1M: 7500 },
  "claude-sonnet-4-7":      { inputPer1M: 300,  outputPer1M: 1500 },
  "claude-sonnet-4-6":      { inputPer1M: 300,  outputPer1M: 1500 },
  "claude-3-7-sonnet":      { inputPer1M: 300,  outputPer1M: 1500 },
  "claude-haiku-4-5":       { inputPer1M: 80,   outputPer1M: 400  },
};

// ── OpenAI ───────────────────────────────────────────────────────────
// TTS charges by input characters, Whisper by audio duration.
export const OPENAI_TTS_PRICING: Record<string, { charsPer1M: number }> = {
  "tts-1":            { charsPer1M: 1500 },  // $15/1M chars
  "tts-1-hd":         { charsPer1M: 3000 },
  "gpt-4o-mini-tts":  { charsPer1M: 60   },  // much cheaper with per-token billing
};

// Whisper: $0.006 per minute of audio → 0.6 cents/minute → 0.01 cents/sec
export const OPENAI_WHISPER_PER_SECOND_CENTS = 0.01;

// ── fal.ai ───────────────────────────────────────────────────────────
// Per-image flat pricing (model-dependent). These are approximate and
// should be verified against each model's fal.ai page.
export const FAL_PRICING: Record<string, { perImageCents: number }> = {
  "fal-ai/imagen4/preview/fast":   { perImageCents: 4  },
  "fal-ai/imagen4/preview":        { perImageCents: 8  },
  "fal-ai/nano-banana-2":          { perImageCents: 8  },
  "fal-ai/nano-banana-2/edit":     { perImageCents: 8  },
  "fal-ai/flux/schnell":           { perImageCents: 1  },
  "fal-ai/flux/pro":               { perImageCents: 5  },
};

// ── Cost calculators ─────────────────────────────────────────────────

export function anthropicCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = ANTHROPIC_PRICING[model];
  if (!rates) return 0;
  const input = (inputTokens * rates.inputPer1M) / 1_000_000;
  const output = (outputTokens * rates.outputPer1M) / 1_000_000;
  // Round up so we never under-report spend by a fraction of a cent.
  return Math.ceil(input + output);
}

export function openAiTtsCostCents(model: string, inputChars: number): number {
  const rates = OPENAI_TTS_PRICING[model];
  if (!rates) return 0;
  return Math.ceil((inputChars * rates.charsPer1M) / 1_000_000);
}

export function openAiWhisperCostCents(audioSeconds: number): number {
  return Math.ceil(audioSeconds * OPENAI_WHISPER_PER_SECOND_CENTS);
}

export function falImageCostCents(model: string, numImages: number): number {
  const rates = FAL_PRICING[model];
  if (!rates) return 0;
  return rates.perImageCents * numImages;
}
