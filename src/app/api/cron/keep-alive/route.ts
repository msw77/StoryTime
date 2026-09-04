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
 * vercel.json). It performs one trivial WRITE to the database — it
 * overwrites the timestamp on a single row in a dedicated `keep_alive`
 * table. A write (not a read) is what reliably resets Supabase's
 * inactivity timer; an earlier read-only version of this cron ran
 * successfully every day but the project still kept auto-pausing.
 * Run scripts/migration-keep-alive.sql once to create the table.
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
    // A WRITE is what reliably resets Supabase's auto-pause timer, so we
    // overwrite the timestamp on the single row of the dedicated
    // `keep_alive` table. This never touches real user data.
    const timestamp = new Date().toISOString();
    const { error } = await supabase
      .from("keep_alive")
      .upsert({ id: 1, last_ping: timestamp }, { onConflict: "id" });

    if (error) {
      console.error("[cron/keep-alive] Supabase write failed:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    // Housekeeping: purge rate-limit rows older than the longest window
    // (24h for generate-story) plus a margin. Non-fatal — a cleanup miss
    // just leaves a few extra tiny rows until tomorrow's run.
    const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { error: purgeError } = await supabase
      .from("rate_limit_events")
      .delete()
      .lt("created_at", cutoff);
    if (purgeError) {
      console.warn("[cron/keep-alive] rate_limit_events purge failed:", purgeError.message);
    }

    return NextResponse.json({ ok: true, timestamp });
  } catch (err) {
    console.error("[cron/keep-alive] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
