import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * Per-user rate limiting on paid AI endpoints, backed by Supabase.
 *
 * Why this exists: every endpoint below costs real money per request
 * (Anthropic, OpenAI, fal.ai). Clerk auth blocks anonymous traffic, but an
 * authenticated user running a script could still drain our API budget —
 * this caps them at a sane per-account ceiling.
 *
 * Why Supabase (not Upstash Redis): we used Upstash, but its free Redis
 * databases are DELETED after ~14 days of inactivity. When ours vanished,
 * the limiter's connection threw and — because it runs before the real AI
 * call — it 500'd every paid endpoint, silently breaking stories, images,
 * and audio. Supabase already holds our real data and is kept awake by the
 * daily keep-alive cron, so the counter lives here now: one fewer service
 * that can disappear. Run scripts/migration-rate-limits.sql once to create
 * the table.
 *
 * How it works: each request inserts one row into `rate_limit_events`
 * tagged with a bucket ("<action>:<userId>"). To check a limit we count the
 * user's rows for that action inside the time window. It's a simple sliding
 * window; a tiny race under concurrent bursts can let a couple extra
 * requests through, which is fine for a cost guardrail. Old rows are purged
 * daily by the keep-alive cron.
 *
 * FAIL OPEN: if Supabase is unreachable, we allow the request rather than
 * break the app. A rate limiter is a cost guardrail, not a hard dependency.
 */

export type LimiterName =
  | "generateStory"
  | "generateImages"
  | "tts"
  | "saveStory"
  | "vocabulary"
  | "comprehension";

// Per-endpoint limits. Windows in seconds. Tuning rationale (unchanged from
// the Upstash setup):
//  - generateStory: heaviest single-shot cost (Claude long-form). 20/day is
//    ~4x a power user's realistic load.
//  - generateImages: also fires during reader playback. 60/hour ≈ 1/min.
//  - tts: one request per page preview. 200/hour covers heavy previewing.
//  - saveStory: triggers TTS for every page. 10/hour stops save-spam.
//  - vocabulary/comprehension: analytics writes, no paid AI cost — loose
//    caps just to bound DB abuse (a kid can tap many vocab words per story).
const RULES: Record<LimiterName, { limit: number; windowSeconds: number }> = {
  generateStory: { limit: 20, windowSeconds: 24 * 60 * 60 },
  generateImages: { limit: 60, windowSeconds: 60 * 60 },
  tts: { limit: 200, windowSeconds: 60 * 60 },
  saveStory: { limit: 10, windowSeconds: 60 * 60 },
  vocabulary: { limit: 2000, windowSeconds: 60 * 60 },
  comprehension: { limit: 200, windowSeconds: 60 * 60 },
};

/**
 * Check a limiter for the given user. Returns { ok: true } to proceed, or
 * { ok: false, response } with a 429 the caller should return. Matches the
 * HelperResult shape so routes can write `if (!rl.ok) return rl.response;`.
 */
export async function enforceRateLimit(
  name: LimiterName,
  userId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const rule = RULES[name];
  const bucket = `${name}:${userId}`;
  const windowStart = new Date(Date.now() - rule.windowSeconds * 1000).toISOString();

  try {
    const supabase = createServiceClient();

    // Count this user's requests for this action inside the window.
    const { count, error: countError } = await supabase
      .from("rate_limit_events")
      .select("*", { count: "exact", head: true })
      .eq("bucket", bucket)
      .gte("created_at", windowStart);

    if (countError) throw countError;

    if ((count ?? 0) >= rule.limit) {
      const retryAfterSeconds = rule.windowSeconds; // conservative upper bound
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
            "X-RateLimit-Limit": String(rule.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
      return { ok: false, response };
    }

    // Record this request. Not awaited-critical, but we await so the count
    // stays honest for the user's very next request.
    const { error: insertError } = await supabase
      .from("rate_limit_events")
      .insert({ bucket });
    if (insertError) throw insertError;

    return { ok: true };
  } catch (err) {
    // FAIL OPEN — a down/misconfigured store must never take the app down.
    console.error(
      `[rate-limit] "${name}" check failed — allowing request (fail-open):`,
      err instanceof Error ? err.message : err,
    );
    return { ok: true };
  }
}
