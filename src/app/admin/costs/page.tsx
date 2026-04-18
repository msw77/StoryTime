"use client";

import { useEffect, useMemo, useState } from "react";

// ── Cost dashboard ──────────────────────────────────────────────────
// Admin-only view (env allowlist) showing:
//   • KPI strip: total spend in period, split by API/one-time/flat
//   • Period toggle (Today / Week / Month / YTD / All)
//   • Stacked bar chart of daily API spend by provider
//   • Tables: per-provider, per-category, one-time costs, flat costs
//
// No charting library — we render the bar chart with native <svg> so
// the admin page stays a single small bundle.

type Period = "today" | "week" | "month" | "ytd" | "all";

interface ApiUsagePayload {
  period: Period;
  from: string;
  apiUsage: {
    totalCents: number;
    byProvider: Record<string, number>;
    byCategory: Record<string, number>;
    byDay: Record<string, Record<string, number>>;
    rowCount: number;
  };
  oneTimeCosts: {
    totalCents: number;
    rows: Array<{
      id: string;
      label: string;
      provider: string | null;
      category: string | null;
      cost_cents: number;
      occurred_at: string;
      notes: string | null;
    }>;
  };
  flatCosts: {
    rows: Array<{
      id: string;
      label: string;
      provider: string | null;
      cadence: "monthly" | "yearly" | "one-time";
      cost_cents: number;
      started_on: string;
      ended_on: string | null;
      notes: string | null;
    }>;
  };
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "7 Days",
  month: "30 Days",
  ytd: "YTD",
  all: "All Time",
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#b55a3c",
  openai: "#6fa39a",
  fal: "#9584ad",
  other: "#8a8170",
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CostDashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<ApiUsagePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/admin/costs?period=${period}`)
      .then((r) =>
        r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error || r.statusText)),
      )
      .then((d) => {
        if (!cancelled) setData(d as ApiUsagePayload);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  // Allocate flat costs into the selected period so the total reflects
  // amortized infra spend, not just the monthly subscription invoice.
  const flatInPeriod = useMemo(() => {
    if (!data) return 0;
    const days = periodDays(period);
    return data.flatCosts.rows.reduce((sum, r) => {
      const perDay =
        r.cadence === "monthly"
          ? r.cost_cents / 30
          : r.cadence === "yearly"
            ? r.cost_cents / 365
            : r.cost_cents;
      return sum + perDay * days;
    }, 0);
  }, [data, period]);

  const headlineTotal = useMemo(() => {
    if (!data) return 0;
    return data.apiUsage.totalCents + data.oneTimeCosts.totalCents + flatInPeriod;
  }, [data, flatInPeriod]);

  return (
    <div className="cost-dashboard">
      <header className="cost-dashboard-header">
        <h1>Cost Dashboard</h1>
        <div className="cost-period-toggle" role="tablist" aria-label="Time period">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              className={`cost-period-btn${period === p ? " active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </header>

      {err && (
        <div className="cost-error">
          <strong>Dashboard error:</strong> {err}
          <div className="cost-error-hint">
            If this says "Admin dashboard not configured", set ADMIN_EMAILS in
            .env.local to your Clerk account email and restart the server.
          </div>
        </div>
      )}

      {loading && !data && <div className="cost-loading">Loading…</div>}

      {data && (
        <>
          <section className="cost-kpis">
            <KpiCard
              label="Total spend"
              value={dollars(headlineTotal)}
              sub={`${PERIOD_LABELS[period]} • ${data.apiUsage.rowCount} API calls`}
              emphasis
            />
            <KpiCard
              label="Live API usage"
              value={dollars(data.apiUsage.totalCents)}
              sub="Claude + OpenAI + fal"
            />
            <KpiCard
              label="One-time costs"
              value={dollars(data.oneTimeCosts.totalCents)}
              sub={`${data.oneTimeCosts.rows.length} entries`}
            />
            <KpiCard
              label="Infra (amortized)"
              value={dollars(flatInPeriod)}
              sub={`${data.flatCosts.rows.length} active line items`}
            />
          </section>

          <section className="cost-chart-wrap">
            <h2>Daily API spend by provider</h2>
            <StackedBarChart byDay={data.apiUsage.byDay} />
          </section>

          <div className="cost-panels">
            <Panel title="By provider">
              <BreakdownList
                rows={Object.entries(data.apiUsage.byProvider).map(([k, v]) => ({
                  key: k,
                  label: k,
                  valueCents: v,
                }))}
                total={data.apiUsage.totalCents}
              />
            </Panel>
            <Panel title="By category">
              <BreakdownList
                rows={Object.entries(data.apiUsage.byCategory).map(([k, v]) => ({
                  key: k,
                  label: k,
                  valueCents: v,
                }))}
                total={data.apiUsage.totalCents}
              />
            </Panel>
          </div>

          <div className="cost-panels">
            <Panel title={`One-time costs (${data.oneTimeCosts.rows.length})`}>
              <LineList
                rows={data.oneTimeCosts.rows.map((r) => ({
                  key: r.id,
                  left: r.label,
                  right: dollars(r.cost_cents),
                  sub: `${r.occurred_at}${r.provider ? ` · ${r.provider}` : ""}${r.category ? ` · ${r.category}` : ""}`,
                }))}
              />
            </Panel>
            <Panel title={`Flat / recurring (${data.flatCosts.rows.length})`}>
              <LineList
                rows={data.flatCosts.rows.map((r) => ({
                  key: r.id,
                  left: r.label,
                  right:
                    r.cadence === "monthly"
                      ? `${dollars(r.cost_cents)}/mo`
                      : r.cadence === "yearly"
                        ? `${dollars(r.cost_cents)}/yr`
                        : dollars(r.cost_cents),
                  sub: `${r.provider ?? "—"} · since ${r.started_on}`,
                }))}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function periodDays(p: Period): number {
  switch (p) {
    case "today":
      return 1;
    case "week":
      return 7;
    case "month":
      return 30;
    case "ytd": {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000));
    }
    case "all":
      return 30; // amortize against 30d window — we don't know "app lifetime"
  }
}

function KpiCard({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`cost-kpi${emphasis ? " emphasis" : ""}`}>
      <div className="cost-kpi-label">{label}</div>
      <div className="cost-kpi-value">{value}</div>
      {sub && <div className="cost-kpi-sub">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cost-panel">
      <h3 className="cost-panel-title">{title}</h3>
      {children}
    </section>
  );
}

function BreakdownList({
  rows,
  total,
}: {
  rows: Array<{ key: string; label: string; valueCents: number }>;
  total: number;
}) {
  if (rows.length === 0) {
    return <div className="cost-empty">No data in this period.</div>;
  }
  const sorted = [...rows].sort((a, b) => b.valueCents - a.valueCents);
  return (
    <ul className="cost-breakdown">
      {sorted.map((r) => {
        const pct = total > 0 ? (r.valueCents / total) * 100 : 0;
        return (
          <li key={r.key} className="cost-breakdown-row">
            <div className="cost-breakdown-label">{r.label}</div>
            <div className="cost-breakdown-bar-wrap">
              <div
                className="cost-breakdown-bar"
                style={{
                  width: `${pct}%`,
                  background: PROVIDER_COLORS[r.label] || "#8a8170",
                }}
              />
            </div>
            <div className="cost-breakdown-value">{dollars(r.valueCents)}</div>
          </li>
        );
      })}
    </ul>
  );
}

function LineList({
  rows,
}: {
  rows: Array<{ key: string; left: string; right: string; sub?: string }>;
}) {
  if (rows.length === 0) {
    return <div className="cost-empty">No entries.</div>;
  }
  return (
    <ul className="cost-list">
      {rows.map((r) => (
        <li key={r.key} className="cost-list-row">
          <div className="cost-list-main">
            <div className="cost-list-left">{r.left}</div>
            {r.sub && <div className="cost-list-sub">{r.sub}</div>}
          </div>
          <div className="cost-list-right">{r.right}</div>
        </li>
      ))}
    </ul>
  );
}

function StackedBarChart({ byDay }: { byDay: Record<string, Record<string, number>> }) {
  const days = Object.keys(byDay).sort();
  if (days.length === 0) {
    return <div className="cost-empty">No usage in this period yet.</div>;
  }
  const providers = Array.from(
    new Set(days.flatMap((d) => Object.keys(byDay[d]))),
  );
  const dayTotals = days.map((d) =>
    providers.reduce((s, p) => s + (byDay[d][p] ?? 0), 0),
  );
  const max = Math.max(1, ...dayTotals);
  const W = 100;
  const H = 140;
  const barWidth = W / days.length;

  return (
    <div className="cost-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="cost-chart-svg">
        {days.map((d, i) => {
          let yCursor = H;
          return (
            <g key={d}>
              {providers.map((p) => {
                const v = byDay[d][p] ?? 0;
                if (v <= 0) return null;
                const h = (v / max) * (H - 4);
                yCursor -= h;
                return (
                  <rect
                    key={p}
                    x={i * barWidth + 0.4}
                    y={yCursor}
                    width={barWidth - 0.8}
                    height={h}
                    fill={PROVIDER_COLORS[p] || "#8a8170"}
                  >
                    <title>
                      {d} · {p}: {dollars(v)}
                    </title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="cost-chart-legend">
        {providers.map((p) => (
          <span key={p} className="cost-chart-legend-item">
            <span className="cost-chart-legend-swatch" style={{ background: PROVIDER_COLORS[p] || "#8a8170" }} />
            {p} · {dollars(providers.length > 0 ? dayTotals.reduce((s, _, i) => s + (byDay[days[i]][p] ?? 0), 0) : 0)}
          </span>
        ))}
      </div>
    </div>
  );
}
