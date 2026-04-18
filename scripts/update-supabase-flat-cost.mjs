/**
 * Supabase plan is free for now. Zero out the seeded $25/mo Pro entry
 * so the dashboard reflects reality.
 *
 * Run with: node scripts/update-supabase-flat-cost.mjs
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

const { data, error } = await supabase
  .from("flat_costs")
  .update({ cost_cents: 0, notes: "Free tier (as of April 2026)" })
  .ilike("label", "%supabase%")
  .select();

if (error) {
  console.error("Update failed:", error.message);
  process.exit(1);
}
console.log(`Zeroed ${data.length} Supabase flat_cost row(s):`);
for (const r of data) {
  console.log(`  ${r.label} → $${(r.cost_cents / 100).toFixed(2)}/${r.cadence}`);
}
