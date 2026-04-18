/**
 * Reconcile seeded OpenAI (TTS + Whisper) estimates against the actual
 * month-to-date number from platform.openai.com/usage. Deletes the
 * per-category estimate rows and replaces them with one accurate entry.
 *
 * Run after updating OPENAI_MTD_CENTS below with the current dashboard
 * total: node scripts/reconcile-openai-costs.mjs
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

// Labels we inserted in seed-cost-tracking.mjs for OpenAI.
const OLD_LABELS = [
  "Classics audio — multi-voice TTS + Whisper (30 stories, ~370 pages)",
];

// Actual OpenAI spend month-to-date, pulled from the billing dashboard
// (platform.openai.com/usage → April spend).
const OPENAI_MTD_CENTS = 1156;

console.log(`Deleting ${OLD_LABELS.length} estimated OpenAI row(s)…`);
for (const label of OLD_LABELS) {
  const { error } = await supabase.from("one_time_costs").delete().eq("label", label);
  if (error) console.warn(`  [FAIL] ${label}: ${error.message}`);
  else console.log(`  [ok]   ${label}`);
}

const accurateLabel = "OpenAI — TTS + Whisper for classics + in-app (actual MTD)";
await supabase.from("one_time_costs").delete().eq("label", accurateLabel);
const { error } = await supabase.from("one_time_costs").insert({
  label: accurateLabel,
  provider: "openai",
  category: "classics",
  cost_cents: OPENAI_MTD_CENTS,
  occurred_at: new Date().toISOString().slice(0, 10),
  notes: "Reconciled against platform.openai.com/usage (April spend). Covers all TTS calls + Whisper transcriptions for classic audio generation + any in-app voice narration.",
});
if (error) {
  console.error("Failed to insert:", error.message);
  process.exit(1);
}

console.log(
  `\nDone. OpenAI spend reconciled to $${(OPENAI_MTD_CENTS / 100).toFixed(2)}.`,
);
