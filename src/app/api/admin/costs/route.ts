import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase";

// Admin cost-dashboard API. Returns aggregated spend for a given time
// period (Today / Week / Month / YTD / All) broken down by provider
// plus category. Also lists flat_costs and one_time_costs for the UI
// to stitch into a single daily picture.
//
// Security: gated by an env allowlist — only Clerk users whose primary
// email matches ADMIN_EMAILS (comma-separated) can hit this endpoint.
// In dev-auth-bypass mode we allow the call through so the dashboard
// renders in the Claude Code preview browser. See src/lib/devBypass.ts.

import { DEV_AUTH_BYPASS } from "@/lib/devBypass";

async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (DEV_AUTH_BYPASS) return { ok: true };

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  const allowlist = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Admin dashboard not configured (ADMIN_EMAILS unset)" },
        { status: 503 },
      ),
    };
  }
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email || !allowlist.includes(email)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true };
}

// Period options map to a `from` timestamp. `to` is always "now".
//
// Timezone note: when the client is in a non-UTC tz (it always is for
// our US-based user), the server computing "today's midnight" using UTC
// clock time gives the wrong window — "today" on the server could be
// up to 24h offset from "today" on the user's screen. So the API
// PREFERS `fromMs` (a millisecond-epoch lower-bound computed by the
// client in its own local tz) and only falls back to the old UTC-based
// logic if the client didn't send it.
function periodStart(period: string, fromMsOverride?: string | null): Date {
  if (fromMsOverride) {
    const n = Number(fromMsOverride);
    if (Number.isFinite(n) && n > 0) return new Date(n);
  }
  const now = new Date();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "ytd": {
      return new Date(now.getFullYear(), 0, 1);
    }
    case "all":
    default:
      return new Date("2020-01-01");
  }
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "month";
  const fromMs = url.searchParams.get("fromMs");
  const from = periodStart(period, fromMs);

  const supabase = createServiceClient();

  // 1) API usage rows in the period
  const { data: usage, error: usageErr } = await supabase
    .from("api_usage")
    .select("provider, operation, category, cost_cents, created_at")
    .gte("created_at", from.toISOString())
    .order("created_at", { ascending: false });

  if (usageErr) {
    return NextResponse.json({ error: usageErr.message }, { status: 500 });
  }

  // 2) One-time costs in the period
  const fromDateOnly = from.toISOString().slice(0, 10);
  const { data: oneTime } = await supabase
    .from("one_time_costs")
    .select("*")
    .gte("occurred_at", fromDateOnly)
    .order("occurred_at", { ascending: false });

  // 3) Flat costs — always return active ones so the UI can amortize
  //    and add them into the chosen period. Frontend does the math.
  const { data: flat } = await supabase
    .from("flat_costs")
    .select("*")
    .or("ended_on.is.null,ended_on.gte." + fromDateOnly);

  // Aggregate api_usage for the headline KPIs
  const usageRows = usage ?? [];
  const totalApiCents = usageRows.reduce((s, r) => s + (r.cost_cents ?? 0), 0);
  const byProvider: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byDay: Record<string, Record<string, number>> = {}; // date → provider → cents
  for (const r of usageRows) {
    byProvider[r.provider] = (byProvider[r.provider] ?? 0) + (r.cost_cents ?? 0);
    const cat = r.category ?? "unknown";
    byCategory[cat] = (byCategory[cat] ?? 0) + (r.cost_cents ?? 0);
    const day = (r.created_at as string).slice(0, 10);
    byDay[day] = byDay[day] ?? {};
    byDay[day][r.provider] = (byDay[day][r.provider] ?? 0) + (r.cost_cents ?? 0);
  }

  const oneTimeTotal = (oneTime ?? []).reduce((s, r) => s + (r.cost_cents ?? 0), 0);

  return NextResponse.json({
    period,
    from: from.toISOString(),
    apiUsage: {
      totalCents: totalApiCents,
      byProvider,
      byCategory,
      byDay,
      rowCount: usageRows.length,
    },
    oneTimeCosts: {
      totalCents: oneTimeTotal,
      rows: oneTime ?? [],
    },
    flatCosts: {
      rows: flat ?? [],
    },
  });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as {
    kind?: "one-time" | "flat";
    label?: string;
    provider?: string;
    category?: string;
    cost_cents?: number;
    occurred_at?: string;
    cadence?: "monthly" | "yearly" | "one-time";
    started_on?: string;
    ended_on?: string;
    notes?: string;
  };

  if (!body.kind || !body.label || typeof body.cost_cents !== "number") {
    return NextResponse.json(
      { error: "Missing required fields: kind, label, cost_cents" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  if (body.kind === "one-time") {
    const { data, error } = await supabase
      .from("one_time_costs")
      .insert({
        label: body.label,
        provider: body.provider ?? null,
        category: body.category ?? null,
        cost_cents: body.cost_cents,
        occurred_at: body.occurred_at ?? new Date().toISOString().slice(0, 10),
        notes: body.notes ?? null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.kind === "flat") {
    if (!body.cadence) {
      return NextResponse.json({ error: "flat requires cadence" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("flat_costs")
      .insert({
        label: body.label,
        provider: body.provider ?? null,
        cadence: body.cadence,
        cost_cents: body.cost_cents,
        started_on: body.started_on ?? new Date().toISOString().slice(0, 10),
        ended_on: body.ended_on ?? null,
        notes: body.notes ?? null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind"); // "one-time" | "flat"
  const id = url.searchParams.get("id");
  if (!id || (kind !== "one-time" && kind !== "flat")) {
    return NextResponse.json({ error: "Missing id or invalid kind" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const table = kind === "one-time" ? "one_time_costs" : "flat_costs";
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
