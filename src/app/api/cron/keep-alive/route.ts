import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

/**
 * Daily keep-alive ping for Supabase.
 *
 * Why this exists: Supabase's free tier auto-pauses a project after
 * ~7 days of zero database activity. Once paused, the whole app
 * breaks — profile creation, story listing, cost dashboard, all of
 * it — until a human logs into supabase.com and clicks Restore.
 * StoryTime's beta usage is intermittent (a parent may not open the
 * app for two weeks), so we can't rely on organic user traffic to
 * keep the project alive.
 *
 * This endpoint runs on a Vercel Cron once every 24 hours (see
 * vercel.json). It performs one trivial read from the database
 * — a HEAD count of one small table — which counts as activity and
 * resets Supabase's inactivity timer.
 *
 * Auth: protected by CRON_SECRET env var. Vercel automatically
 * attaches `Authorization: Bearer $CRON_SECRET` to cron-triggered
 * requests when CRON_SECRET is set on the project. Any other
 * request (including humans hitting the URL) gets rejected with
 * 401. This prevents the endpoint from being pinged by scrapers
 * and inflating Supabase's usage counters.
 *
 * If CRON_SECRET isn't set, the endpoint refuses ALL requests —
 * safer than accidentally running open. Set the env var (any
 * random string, ~32 chars) in Vercel → Settings → Environment
 * Variables → Add: CRON_SECRET (Sensitive on).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Cron endpoint disabled: CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    // Cheapest possible query that still counts as "database activity"
    // for the pause-detection heuristic. HEAD count on a tiny table
    // (child_profiles is much smaller than stories or api_usage).
    const { count, error } = await supabase
      .from("child_profiles")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("[cron/keep-alive] Supabase query failed:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      profileCount: count ?? 0,
    });
  } catch (err) {
    console.error("[cron/keep-alive] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
