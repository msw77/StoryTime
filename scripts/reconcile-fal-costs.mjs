/**
 * Reconcile seeded fal.ai estimates against the actual number from
 * fal.ai's billing dashboard. Deletes the per-batch estimate rows and
 * replaces them with one accurate line item pulled from fal's UI.
 *
 * Run with: node scripts/reconcile-fal-costs.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, "..", ".env.local");
const env = readFileSync(envPath, "utf-8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();
const supabase = createClient(url, key);

// Labels we inserted in seed-cost-tracking.mjs for fal. These get
// replaced by the single accurate entry below.
const OLD_LABELS = [
  "Classics images — Imagen 4 Fast initial pass (~410 images)",
  "Classics images — Nano Banana 2 regeneration (9 stories)",
  "Classics images — Phase 1a batch B (8 more stories)",
  "Classics images — Phase 1c + big batch cleanup (~100 page retries)",
  "Brand assets (logo wordmark, hero illustration, icons)",
];

// Actual fal.ai spend this month, pulled from fal's billing dashboard
// ("Usage this month: $156.63"). Everything the app has ever done on
// fal up to this reconciliation point, in one entry.
const ACTUAL_FAL_USAGE_CENTS = 15663;

console.log(`Deleting ${OLD_LABELS.length} estimated fal rows…`);
for (const label of OLD_LABELS) {
  const { error } = await supabase.from("one_time_costs").delete().eq("label", label);
  if (error) console.warn(`  [FAIL] ${label}: ${error.message}`);
  else console.log(`  [ok]   ${label}`);
}

const accurateLabel = "fal.ai — all classics + brand images (actual per fal dashboard)";
// Upsert-style: delete any existing row with this label first, then insert fresh.
await supabase.from("one_time_costs").delete().eq("label", accurateLabel);
const { error: insertErr } = await supabase.from("one_time_costs").insert({
  label: accurateLabel,
  provider: "fal",
  category: "classics",
  cost_cents: ACTUAL_FAL_USAGE_CENTS,
  occurred_at: new Date().toISOString().slice(0, 10),
  notes: "Reconciled against fal.ai billing dashboard. Replaces prior per-batch estimates which under-reported actual spend (Imagen 4 Fast + Nano Banana 2 retries + brand assets combined).",
});
if (insertErr) {
  console.error("Failed to insert accurate row:", insertErr.message);
  process.exit(1);
}

console.log(
  `\nDone. fal.ai spend reconciled to $${(ACTUAL_FAL_USAGE_CENTS / 100).toFixed(2)}.`,
);
