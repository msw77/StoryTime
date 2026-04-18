/**
 * The three reconcile one-time-cost entries (fal/Anthropic/OpenAI
 * month-to-date totals) were stamped with occurred_at = the day I ran
 * the reconcile scripts. That bucketed them into the "Today" tile on
 * the cost dashboard, which is wrong — they represent cumulative spend
 * from project start through the reconcile moment.
 *
 * Pragmatic fix: backdate each to the project start (2026-04-03) so
 * today's tile shows only actual today-spend. "YTD" and "All Time"
 * still include them correctly. "Week" may slightly underestimate but
 * that's an acceptable trade until we add proper amortization for
 * date-range one-time entries.
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

const PROJECT_START = "2026-04-03";
// Match the 3 reconcile entries by the label prefix the reconcile scripts use.
const LABEL_PATTERNS = ["fal.ai —", "Anthropic —", "OpenAI —"];

let updated = 0;
for (const pattern of LABEL_PATTERNS) {
  const { data, error } = await supabase
    .from("one_time_costs")
    .update({ occurred_at: PROJECT_START })
    .ilike("label", `${pattern}%`)
    .select();
  if (error) {
    console.error(`Failed for "${pattern}":`, error.message);
    continue;
  }
  for (const r of data) {
    console.log(`  ${r.occurred_at}  $${(r.cost_cents / 100).toFixed(2).padStart(8)}  ${r.label}`);
    updated++;
  }
}
console.log(`\nUpdated ${updated} reconcile entries → occurred_at = ${PROJECT_START}`);
