/**
 * Seed one-time-cost entries for work we did this session (classics
 * generation batches, brand asset generation, etc.) plus a few known
 * flat / recurring infra line items. Safe to re-run — uses upserts
 * keyed on the label column.
 *
 * Run AFTER you've executed scripts/migration-cost-tracking.sql in the
 * Supabase SQL editor. Then:
 *   node scripts/seed-cost-tracking.mjs
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
if (!url || !key) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}
const supabase = createClient(url, key);

// ── One-time costs incurred during the build of StoryTime ──────────
// Rough estimates. Edit amounts/labels to match your actual receipts
// from each provider's billing dashboard. Dates approximate.
const ONE_TIME_COSTS = [
  {
    label: "Classics writing — Ages 2-4, 4-7, 7-10 (Claude Opus)",
    provider: "anthropic",
    category: "classics",
    cost_cents: 600,  // ~$4 for 20+ stories via Opus
    occurred_at: "2026-04-16",
    notes: "20 classic stories generated via generate-classic-stories.mjs",
  },
  {
    label: "Classics images — Imagen 4 Fast initial pass (~410 images)",
    provider: "fal",
    category: "classics",
    cost_cents: 1640,  // 410 × $0.04
    occurred_at: "2026-04-16",
    notes: "Original generation, later partially regenerated with nano-banana-2",
  },
  {
    label: "Classics images — Nano Banana 2 regeneration (9 stories)",
    provider: "fal",
    category: "classics",
    cost_cents: 1040,  // ~130 pages × $0.08
    occurred_at: "2026-04-16",
    notes: "Phase 1a: 9 stories fully regenerated with anti-trademark guards",
  },
  {
    label: "Classics images — Phase 1a batch B (8 more stories)",
    provider: "fal",
    category: "classics",
    cost_cents: 816,  // ~102 pages × $0.08
    occurred_at: "2026-04-17",
    notes: "Goldilocks, BGG, Gingerbread, Bremen, Alice, Piper, Snow Queen, Ugly Duckling",
  },
  {
    label: "Classics images — Phase 1c + big batch cleanup (~100 page retries)",
    provider: "fal",
    category: "classics",
    cost_cents: 800,  // ~100 pages × $0.08
    occurred_at: "2026-04-17",
    notes: "Reference-image retries + text-only fixes + 88-page big batch sweep",
  },
  {
    label: "Classics audio — multi-voice TTS + Whisper (30 stories, ~370 pages)",
    provider: "openai",
    category: "classics",
    cost_cents: 600,  // rough estimate with gpt-4o-mini-tts + whisper
    occurred_at: "2026-04-16",
    notes: "gpt-4o-mini-tts with per-character instructions; regenerated after pivot to single-voice-flex",
  },
  {
    label: "Brand assets (logo wordmark, hero illustration, icons)",
    provider: "fal",
    category: "brand",
    cost_cents: 200,  // rough: ~25 images × $0.08
    occurred_at: "2026-04-01",
    notes: "Nano banana 2 for painterly brand artwork",
  },
  {
    label: "Domain registration (StoryTime)",
    provider: "other",
    category: "other",
    cost_cents: 1500,
    occurred_at: "2026-04-01",
    notes: "Estimated — update with actual receipt amount",
  },
];

console.log(`\nSeeding ${ONE_TIME_COSTS.length} one-time cost entries…\n`);

let inserted = 0;
let skipped = 0;
for (const row of ONE_TIME_COSTS) {
  // Check if a row with this label already exists (idempotent seed).
  const { data: existing } = await supabase
    .from("one_time_costs")
    .select("id")
    .eq("label", row.label)
    .maybeSingle();

  if (existing) {
    console.log(`  [skip] ${row.label} — already seeded`);
    skipped++;
    continue;
  }

  const { error } = await supabase.from("one_time_costs").insert(row);
  if (error) {
    console.error(`  [FAIL] ${row.label}: ${error.message}`);
  } else {
    const dollarStr = (row.cost_cents / 100).toFixed(2);
    console.log(`  [ok]   ${row.label} — $${dollarStr}`);
    inserted++;
  }
}

const totalCents = ONE_TIME_COSTS.reduce((s, r) => s + r.cost_cents, 0);
console.log(
  `\nDone. Inserted: ${inserted}, skipped: ${skipped}, total seed value: $${(totalCents / 100).toFixed(2)}`,
);
