import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";

/**
 * Per-user rate limiting on paid AI endpoints.
 *
 * Why this exists: every one of the endpoints below costs real money per
 * request (Anthropic, OpenAI, fal.ai). Without a cap, a single malicious or
 * runaway client could drain our API budget in minutes. Clerk auth already
 * blocks anonymous traffic, but an authenticated user who flips a script on
 * can still do damage — this caps them at a sane per-account ceiling.
 *
 * Keyed by Clerk user id (NOT IP) because IPs are shared (coffee shops,
 * corporate NAT, mobile carriers) and trivially rotated. User id is the
 * actual billing unit we care about.
 *
 * If Upstash env vars are missing (local dev without Redis), the limiter
 * short-circuits to "allow" so we don't break the dev loop. Production
 * deploys on Vercel MUST have these env vars set — see README.
 */

const hasRedis =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

// Singleton Redis client. Recreated on cold start of a serverless function,
// reused across warm invocations, which keeps command count low.
const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

/**
 * Limiter definitions. Each endpoint gets its own namespace so bursts on
 * one surface don't starve the others. Windows are sliding so a user can't
 * game a fixed bucket by queuing requests at the reset boundary.
 *
 * Tuning rationale:
 * - generate-story: heaviest single-shot cost (Claude long-form). 20/day is
 *   ~4× a power user's realistic load; beyond that it's probably a script.
 * - generate-images: called during reader playback too, not just authoring.
 *   60/hour ≈ 1 image/minute sustained — fine for real use, stops runaway
 *   loops fast.
 * - tts: one request per page preview. 200/hour covers a parent previewing
 *   ~10 stories back-to-back without hitting the cap.
 * - save-story: the POST body triggers TTS for every page. Cap at 10/hour
 *   so a user can't spam "save" and burn through TTS credits that way.
 *
 * All caps are intentionally generous for real humans and intentionally
 * tight for scripts. We'd rather an abuser see a 429 than see our bill.
 */
export const limiters = hasRedis
  ? {
      generateStory: new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(20, "1 d"),
        analytics: true,
        prefix: "rl:generate-story",
      }),
      generateImages: new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(60, "1 h"),
        analytics: true,
        prefix: "rl:generate-images",
      }),
      tts: new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(200, "1 h"),
        analytics: true,
        prefix: "rl:tts",
      }),
      saveStory: new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        analytics: true,
        prefix: "rl:save-story",
      }),
      // Analytics-write endpoints (no paid AI cost per call, but they
      // hit Supabase on every invocation). Caps are intentionally loose
      // vs the AI limiters — a kid tapping vocab words during active
      // reading can realistically hit 50–100 in a single story. The
      // purpose is abuse prevention and DB-cost ceiling, not throttling
      // real use. A scripted abuser would burn through these caps
      // before doing meaningful damage.
      vocabulary: new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(2000, "1 h"),
        analytics: true,
        prefix: "rl:vocabulary",
      }),
      comprehension: new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(200, "1 h"),
        analytics: true,
        prefix: "rl:comprehension",
      }),
    }
  : null;

export type LimiterName =
  | "generateStory"
  | "generateImages"
  | "tts"
  | "saveStory"
  | "vocabulary"
  | "comprehension";

/**
 * Check a limiter for the given user. Returns { ok: true } to proceed, or
 * { ok: false, response } with a 429 NextResponse the caller should return.
 *
 * Shape matches the HelperResult pattern in api-helpers.ts so routes can
 * write `if (!rl.ok) return rl.response;` and move on.
 */
export async function enforceRateLimit(
  name: LimiterName,
  userId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // Dev-mode fallback: no Redis configured, allow everything. This keeps
  // local dev friction-free; production is required to have env vars.
  if (!limiters) return { ok: true };

  const limiter = limiters[name];
  const { success, limit, remaining, reset } = await limiter.limit(userId);

  if (success) return { ok: true };

  // Build a 429 with standard rate-limit headers so clients (and any
  // future CDN) can back off intelligently. The body message is phrased
  // for end users — the reader will surface it verbatim.
  const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  const response = NextResponse.json(
    {
      error: "Rate limit exceeded",
      message:
        "You've hit the usage limit for this feature. Please wait a bit and try again.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(reset),
      },
    },
  );
  return { ok: false, response };
}
