/**
 * Set all flat_costs rows to started_on = 2026-04-03 since the project
 * began in early April. Otherwise the amortization window is the date
 * the migration ran (today), which credits zero active days.
 *
 * Run with: node scripts/update-flat-cost-dates.mjs
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

const { data, error } = await supabase
  .from("flat_costs")
  .update({ started_on: PROJECT_START })
  .gt("id", "00000000-0000-0000-0000-000000000000")
  .select();

if (error) {
  console.error("Update failed:", error.message);
  process.exit(1);
}
console.log(`Updated ${data.length} flat_cost rows to started_on = ${PROJECT_START}`);
for (const r of data) {
  console.log(`  ${r.label} (${r.cadence})`);
}
