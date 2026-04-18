/**
 * Big batch sweep: ~80 page-level image retries across ~25 stories.
 * Reads storyImages.json + classicStories*.ts, runs the image generator
 * for each entry in RETRY_LIST with optional reference-image conditioning.
 *
 * Run with: node scripts/cleanup-image-retries.mjs
 *
 * Each entry: [storyId, pageNum (1-based), referencePageNum? (1-based)]
 * If referencePageNum is null, the retry runs in text-to-image mode with
 * the per-story guard directives. Otherwise it uses nano-banana-2 edit
 * mode with the reference page as character/style conditioning.
 *
 * Shells out to the existing generate-classic-images.mjs so all the prompt
 * engineering, guards, scrubbers, error handling, and resumability live
 * in one place.
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const IMAGE_SCRIPT = join(__dirname, "generate-classic-images.mjs");

// Each entry: [storyId, page, reference?]
// reference is the page number (1-based) within the same story to use as
// a character/style reference. null/undefined = pure text-to-image retry.
const RETRY_LIST = [
  // ── Phase 1a regenerated stories — page-level residual ──
  ["classic_rumpelstiltskin", 11, 2],
  ["classic_rumpelstiltskin", 12, 2],
  ["classic_pinocchio", 6, 3],
  ["classic_pinocchio", 8, 3],
  ["classic_pinocchio", 9, 3],
  ["classic_jungle_book", 5, 2],
  ["classic_jungle_book", 6, 2],
  ["classic_jungle_book", 9, 2],
  ["classic_jungle_book", 14, 2],
  ["classic_jungle_book", 8, null], // safety retry
  ["classic_jungle_book", 17, null], // safety retry
  ["classic_jungle_book", 18, 2],
  ["classic_rapunzel", 4, 2],
  ["classic_rapunzel", 10, 2],
  ["classic_aladdin", 6, null], // genie: no good reference
  ["classic_aladdin", 9, 3],
  ["classic_aladdin", 12, null], // genie: no good reference
  ["classic_aladdin", 13, 3],
  ["classic_cinderella", 2, 4],
  ["classic_cinderella", 5, 4],
  ["classic_cinderella", 8, 4],
  ["classic_cinderella", 9, null], // ball gown retry: need fresh scene, no good ref
  ["classic_cinderella", 10, null],
  ["classic_cinderella", 13, null],
  // Rip Van Winkle: pre-nap age bug, all 10 early pages need middle-aged Rip
  ...Array.from({ length: 10 }, (_, i) => ["classic_rip_van_winkle", i + 1, null]),
  ["classic_secret_garden", 3, 5],
  ["classic_secret_garden", 6, 5],
  ["classic_secret_garden", 11, 5],
  ["classic_secret_garden", 17, null], // split-panel: fresh composition

  // ── Phase 1a batch-B residual ──
  ["classic_goldilocks", 5, 7],
  ["classic_goldilocks", 10, 7],
  ["classic_billy_goats_gruff", 3, 2],
  ["classic_billy_goats_gruff", 4, 2],
  ["classic_billy_goats_gruff", 6, 2],
  ["classic_billy_goats_gruff", 9, 2],
  ["classic_gingerbread_man", 6, 3],
  ["classic_gingerbread_man", 8, 3],
  ["classic_bremen_musicians", 9, 1],
  ["classic_alice_wonderland", 2, 5],
  ["classic_alice_wonderland", 3, 5],
  ["classic_alice_wonderland", 4, 5],
  ["classic_alice_wonderland", 15, 5],
  ["classic_alice_wonderland", 17, 5],
  ["classic_pied_piper", 3, 7],
  ["classic_pied_piper", 4, 7],
  ["classic_pied_piper", 8, 7],
  ["classic_snow_queen", 8, null],
  ["classic_snow_queen", 10, null],
  ["classic_snow_queen", 11, null],
  ["classic_ugly_duckling", 6, 3],

  // ── Non-regen'd stories (original page-level issues) ──
  ["classic_tortoise_hare", 2, null],
  ["classic_tortoise_hare", 8, null],
  ["classic_red_riding_hood", 6, null],
  ["classic_enormous_turnip", 3, null],
  ["classic_enormous_turnip", 4, null],
  ["classic_enormous_turnip", 6, null],
  ["classic_thumbelina", 1, null],
  ["classic_thumbelina", 11, null],
  ["classic_puss_in_boots", 5, null],
  ["classic_puss_in_boots", 7, null],
  ["classic_puss_in_boots", 10, null], // transformation
  ["classic_puss_in_boots", 11, null], // transformation
  ["classic_puss_in_boots", 12, null],
  ["classic_wizard_oz", 4, null],
  ["classic_wizard_oz", 7, null],
  ["classic_wizard_oz", 17, null],
  ["classic_wizard_oz", 18, null],
  ["classic_robin_hood", 9, null],
  ["classic_robin_hood", 14, null],
  ["classic_robin_hood", 15, null],
  ["classic_robin_hood", 17, null],
  ["classic_treasure_island", 1, null],
  ["classic_treasure_island", 4, null],
  ["classic_treasure_island", 11, null],
  ["classic_wind_willows", 1, null],
  ["classic_wind_willows", 3, null],
  ["classic_wind_willows", 9, null],
  ["classic_wind_willows", 11, null],

  // ── Broken URL from original gen ──
  ["classic_elves_shoemaker", 3, null],
];

function runOne(storyId, page, reference) {
  return new Promise((resolve) => {
    const args = [
      IMAGE_SCRIPT,
      `--story=${storyId}`,
      `--page=${page}`,
      "--force",
    ];
    if (reference) args.push(`--reference=${reference}`);

    const proc = spawn("node", args, { cwd: ROOT });
    let err = "";

    proc.stdout.on("data", (d) => process.stdout.write(d));
    proc.stderr.on("data", (d) => {
      err += d.toString();
      process.stderr.write(d);
    });
    proc.on("close", (code) => resolve({ code, err }));
  });
}

// ── Main ────────────────────────────────────────────────────────────
console.log(`\n🧹 Big batch cleanup: ${RETRY_LIST.length} page retries\n`);

let success = 0;
let failed = 0;
const failures = [];

for (let i = 0; i < RETRY_LIST.length; i++) {
  const [storyId, page, reference] = RETRY_LIST[i];
  const label = `${i + 1}/${RETRY_LIST.length} ${storyId} p${page}${reference ? ` (ref p${reference})` : " (text-only)"}`;
  console.log(`\n━━━ ${label} ━━━`);

  const { code } = await runOne(storyId, page, reference);
  if (code === 0) {
    success++;
  } else {
    failed++;
    failures.push(label);
  }
}

console.log(`\n═══════════════════════════════════════`);
console.log(`🧹 Cleanup done — ${success} succeeded, ${failed} failed`);
if (failures.length) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  ✗ ${f}`);
}
