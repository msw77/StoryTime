/**
 * Reconcile seeded Anthropic estimates against the actual month-to-date
 * number from console.anthropic.com → Usage. Deletes the per-category
 * estimate rows and replaces them with one accurate entry.
 *
 * Run after updating ANTHROPIC_MTD_CENTS below with the current dashboard
 * total: node scripts/reconcile-anthropic-costs.mjs
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

// Labels we inserted in seed-cost-tracking.mjs for Anthropic. These
// get replaced by the single accurate entry below.
const OLD_LABELS = [
  "Classics writing — Ages 2-4, 4-7, 7-10 (Claude Opus)",
];

// Actual Anthropic spend month-to-date, pulled from the billing dashboard
// (console.anthropic.com → Usage → Month to date → Total token cost).
const ANTHROPIC_MTD_CENTS = 1041;

console.log(`Deleting ${OLD_LABELS.length} estimated Anthropic row(s)…`);
for (const label of OLD_LABELS) {
  const { error } = await supabase.from("one_time_costs").delete().eq("label", label);
  if (error) console.warn(`  [FAIL] ${label}: ${error.message}`);
  else console.log(`  [ok]   ${label}`);
}

const accurateLabel = "Anthropic — classics + in-app story generation (actual MTD)";
await supabase.from("one_time_costs").delete().eq("label", accurateLabel);
const { error } = await supabase.from("one_time_costs").insert({
  label: accurateLabel,
  provider: "anthropic",
  category: "classics",
  cost_cents: ANTHROPIC_MTD_CENTS,
  // Backdate to project-start so "Today" on the dashboard doesn't
  // treat month-to-date cumulative spend as a single today-expense.
  // "YTD" / "All" still include the entry correctly.
  occurred_at: "2026-04-03",
  notes: "Reconciled against console.anthropic.com Usage dashboard (Month to date). Covers classic story writing batches + any in-app story generation.",
});
if (error) {
  console.error("Failed to insert:", error.message);
  process.exit(1);
}

console.log(
  `\nDone. Anthropic spend reconciled to $${(ANTHROPIC_MTD_CENTS / 100).toFixed(2)}.`,
);
