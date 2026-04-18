/**
 * Diagnose what's making the "Today" tile on the cost dashboard so big.
 * Prints: api_usage summed by day, one-time costs by occurred_at, and
 * flat costs amortized to today.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const env = readFileSync(join(__dirname, "..", ".env.local"), "utf-8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();
const supabase = createClient(url, key);

const today = new Date();
today.setHours(0, 0, 0, 0);
const todayIso = today.toISOString();
const todayDate = todayIso.slice(0, 10);

console.log(`Local midnight: ${todayIso}`);
console.log(`Today date: ${todayDate}\n`);

const { data: usage } = await supabase
  .from("api_usage")
  .select("provider, operation, category, cost_cents, created_at")
  .gte("created_at", todayIso)
  .order("created_at", { ascending: false });

console.log(`── api_usage rows since local midnight (${usage?.length ?? 0} rows) ──`);
const apiTotalCents = (usage ?? []).reduce((s, r) => s + (r.cost_cents ?? 0), 0);
console.log(`  total: $${(apiTotalCents / 100).toFixed(2)}`);
const byProv = {};
for (const r of usage ?? []) {
  byProv[r.provider] = (byProv[r.provider] ?? 0) + (r.cost_cents ?? 0);
}
for (const [p, c] of Object.entries(byProv)) {
  console.log(`  ${p.padEnd(12)} $${(c / 100).toFixed(2)}`);
}

const { data: oneTime } = await supabase
  .from("one_time_costs")
  .select("*")
  .gte("occurred_at", todayDate)
  .order("occurred_at", { ascending: false });

console.log(`\n── one_time_costs where occurred_at >= ${todayDate} (${oneTime?.length ?? 0} rows) ──`);
const otTotalCents = (oneTime ?? []).reduce((s, r) => s + (r.cost_cents ?? 0), 0);
console.log(`  total: $${(otTotalCents / 100).toFixed(2)}`);
for (const r of oneTime ?? []) {
  console.log(`  ${r.occurred_at} | ${(r.cost_cents / 100).toFixed(2).padStart(8)} | ${r.label}`);
}

const { data: flat } = await supabase.from("flat_costs").select("*");
console.log(`\n── flat_costs (${flat?.length ?? 0} rows) ──`);
let flatTotalCents = 0;
for (const r of flat ?? []) {
  const started = new Date(r.started_on).getTime();
  const ended = r.ended_on ? new Date(r.ended_on).getTime() : Date.now();
  const periodStart = today.getTime();
  const periodEnd = Date.now();
  const overlapStart = Math.max(started, periodStart);
  const overlapEnd = Math.min(ended, periodEnd);
  const activeDays = Math.max(0, (overlapEnd - overlapStart) / 86_400_000);
  const perDay =
    r.cadence === "monthly"
      ? r.cost_cents / 30
      : r.cadence === "yearly"
        ? r.cost_cents / 365
        : r.cost_cents;
  const contrib = perDay * activeDays;
  flatTotalCents += contrib;
  console.log(
    `  ${r.cadence.padEnd(7)} ${r.label.padEnd(20)} $${(r.cost_cents / 100).toFixed(2).padStart(8)}  → today contribution $${(contrib / 100).toFixed(2)}`
  );
}
console.log(`  today flat total: $${(flatTotalCents / 100).toFixed(2)}`);

console.log(`\n══ GRAND TOTAL for "Today" ══`);
console.log(`  api_usage        $${(apiTotalCents / 100).toFixed(2)}`);
console.log(`  one_time_costs   $${(otTotalCents / 100).toFixed(2)}`);
console.log(`  flat (amortized) $${(flatTotalCents / 100).toFixed(2)}`);
console.log(`  ─────────────────────`);
console.log(`  TOTAL            $${((apiTotalCents + otTotalCents + flatTotalCents) / 100).toFixed(2)}`);
