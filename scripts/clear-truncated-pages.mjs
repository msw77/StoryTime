/**
 * Find every page in storyAudio.json where the TTS output was almost
 * certainly truncated (Whisper token count < display word count by 3+),
 * and NULL out its entry so the next run of generate-classic-audio or
 * generate-builtin-audio will regenerate just those pages.
 *
 * Why this exists:
 *   - Aladdin p1 proved that gpt-4o-mini-tts sometimes silently drops
 *     the last sentence. The reader then skips those words and
 *     autoplays to the next page. The new validation loop catches
 *     this going forward, but we already have 21 pages in the corpus
 *     that were generated before validation existed.
 *
 * Approach:
 *   1. Scan storyAudio.json + all story-text sources (JSON + TS files).
 *   2. For each page, compare display word count to whisper token count.
 *   3. If missing >= 3, null out audioData[storyId][pageIdx] and log it.
 *   4. Write storyAudio.json back.
 *
 * Then the user runs:
 *   node scripts/generate-classic-audio.mjs
 *   node scripts/generate-builtin-audio.mjs
 * Both iterate all stories but skip pages that already have timings,
 * so only the nulled pages regenerate.
 *
 * Dry run: pass --dry to see what would be cleared without writing.
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const DRY_RUN = process.argv.includes("--dry");
const MIN_MISSING = 3;

// ── Load audio + story text ──────────────────────────────────────────
const audioPath = join(ROOT, "src", "data", "storyAudio.json");
const audio = JSON.parse(readFileSync(audioPath, "utf-8"));

// Non-classic stories (builtin + history) live in generatedStories.json.
const builtinPath = join(ROOT, "src", "data", "generatedStories.json");
const builtin = JSON.parse(readFileSync(builtinPath, "utf-8"));

// Classic stories are in TS files with a specific shape. Parse them the
// same way the audio generator does — a loose regex-based extractor
// tolerant of nested quotes.
function parseClassicsFile(relPath) {
  const path = join(ROOT, relPath);
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return [];
  }
  const match = raw.match(/export const \w+:\s*Story\[\]\s*=\s*(\[[\s\S]*\]);/);
  if (!match) return [];
  try {
    // eslint-disable-next-line no-new-func
    return new Function("return " + match[1])();
  } catch {
    return [];
  }
}

const classicsSources = [
  "src/data/classicStories2to4.ts",
  "src/data/classicStories4to7.ts",
  "src/data/classicStories7to10.ts",
];
const classicsById = {};
for (const rel of classicsSources) {
  for (const story of parseClassicsFile(rel)) {
    classicsById[story.id] = story;
  }
}

// Unified page-text lookup. Builtin pages have shape { text, ... }.
// Classic pages have shape [ "Page N", "text" ] tuples.
function getPageText(storyId, pageIdx) {
  const b = builtin[storyId];
  if (b?.pages?.[pageIdx]) {
    const p = b.pages[pageIdx];
    if (typeof p?.text === "string") return p.text;
    if (Array.isArray(p) && typeof p[1] === "string") return p[1];
  }
  const c = classicsById[storyId];
  if (c?.pages?.[pageIdx]) {
    const p = c.pages[pageIdx];
    if (Array.isArray(p) && typeof p[1] === "string") return p[1];
    if (typeof p?.text === "string") return p.text;
  }
  return null;
}

// ── Scan ─────────────────────────────────────────────────────────────
const cleanLen = (w) => (w || "").replace(/[^\p{L}\p{N}]/gu, "").length;
const flagged = [];

for (const storyId of Object.keys(audio)) {
  const pages = audio[storyId];
  if (!Array.isArray(pages)) continue;
  for (let pi = 0; pi < pages.length; pi++) {
    const p = pages[pi];
    if (!p?.wordTimings?.length) continue;
    const text = getPageText(storyId, pi);
    if (!text) continue;
    const displayCount = text.split(/\s+/).filter(Boolean).length;
    const whisperCount = p.wordTimings.filter((w) => cleanLen(w.word) > 0).length;
    const missing = displayCount - whisperCount;
    if (missing >= MIN_MISSING) {
      flagged.push({ storyId, pageIdx: pi, displayCount, whisperCount, missing });
    }
  }
}

console.log(
  `Scanned corpus. Found ${flagged.length} truncated pages (display - whisper >= ${MIN_MISSING}):\n`
);
for (const f of flagged) {
  console.log(
    `  ${f.storyId.padEnd(32)} p${String(f.pageIdx + 1).padStart(3)}  display=${f.displayCount}  whisper=${f.whisperCount}  missing=${f.missing}`
  );
}

if (flagged.length === 0) {
  console.log("\nNothing to clear. Corpus is clean.");
  process.exit(0);
}

if (DRY_RUN) {
  console.log(`\n(--dry passed — not writing storyAudio.json)`);
  process.exit(0);
}

// ── Clear ────────────────────────────────────────────────────────────
let cleared = 0;
for (const f of flagged) {
  if (audio[f.storyId]?.[f.pageIdx]) {
    audio[f.storyId][f.pageIdx] = null;
    cleared++;
  }
}
writeFileSync(audioPath, JSON.stringify(audio, null, 2));

console.log(`\n✓ Cleared ${cleared} entries from storyAudio.json.`);
console.log(`\nNext steps:`);
console.log(`  1. node scripts/generate-classic-audio.mjs   # regenerates cleared classic pages`);
console.log(`  2. node scripts/generate-builtin-audio.mjs   # regenerates cleared builtin/history pages`);
console.log(`\nBoth scripts skip pages that already have timings, so only the 20 cleared ones will regenerate.`);
