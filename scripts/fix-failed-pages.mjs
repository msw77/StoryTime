/**
 * For the small set of pages whose TTS kept truncating (coverage
 * validation failed 3x), normalize the source text in place so TTS
 * gets clean input next retry. Scoped to ONLY these pages — we don't
 * touch any page whose existing audio is fine, because changing the
 * display text without regenerating audio would introduce alignment
 * drift where there was none before.
 *
 * After running, clear audio for these pages and rerun the audio
 * generators; the validation loop + cleaner text should succeed.
 *
 * Usage:
 *   node scripts/fix-failed-pages.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { normalizeStoryText } from "./lib/text-normalize.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// (storyId, pageIdx) for each page whose audio persistently failed TTS
// coverage validation with 3 attempts. From the 2026-04-18 regen run.
const FAILED = [
  { storyId: "h1", pageIdx: 2, source: "json" },
  { storyId: "m3", pageIdx: 9, source: "json" },
  { storyId: "f4", pageIdx: 0, source: "json" },
  { storyId: "h6", pageIdx: 0, source: "json" },
  { storyId: "s9", pageIdx: 5, source: "json" },
  { storyId: "classic_wind_willows", pageIdx: 15, source: "ts7to10" },
  { storyId: "classic_pied_piper", pageIdx: 17, source: "ts7to10" },
];

// ── Update generatedStories.json entries ─────────────────────────────
const jsonPath = join(ROOT, "src", "data", "generatedStories.json");
const json = JSON.parse(readFileSync(jsonPath, "utf-8"));
let jsonChanges = 0;
for (const f of FAILED) {
  if (f.source !== "json") continue;
  const page = json[f.storyId]?.pages?.[f.pageIdx];
  if (!page?.text) {
    console.warn(`  [skip] ${f.storyId} p${f.pageIdx + 1} — page not found in JSON`);
    continue;
  }
  const after = normalizeStoryText(page.text);
  if (after !== page.text) {
    console.log(`  [json] ${f.storyId} p${f.pageIdx + 1}`);
    console.log(`    before: ${page.text.slice(0, 110).replace(/\s+/g, " ")}…`);
    console.log(`    after : ${after.slice(0, 110).replace(/\s+/g, " ")}…`);
    page.text = after;
    jsonChanges++;
  } else {
    console.log(`  [noop] ${f.storyId} p${f.pageIdx + 1} — no change needed`);
  }
}
if (jsonChanges > 0) writeFileSync(jsonPath, JSON.stringify(json, null, 2));

// ── Update classic TS files (scoped to FAILED ids only) ──────────────
function fixClassicTsFile(relPath, targets) {
  const p = join(ROOT, relPath);
  let raw = readFileSync(p, "utf-8");
  let tsChanges = 0;

  for (const t of targets) {
    // Find the story block by id, then find the (pageIdx+1)-th tuple
    // within its pages array.
    const idPattern = new RegExp(`"id":\\s*"${t.storyId}"`);
    const idMatch = raw.match(idPattern);
    if (!idMatch) {
      console.warn(`  [skip] ${t.storyId} — not in ${relPath}`);
      continue;
    }
    // Find "pages": [ after this id.
    const pagesStart = raw.indexOf(`"pages":`, idMatch.index);
    if (pagesStart < 0) continue;
    const openBracket = raw.indexOf("[", pagesStart);
    // Walk to matching close bracket.
    let depth = 1;
    let i = openBracket + 1;
    while (i < raw.length && depth > 0) {
      if (raw[i] === "[") depth++;
      else if (raw[i] === "]") depth--;
      if (depth === 0) break;
      i++;
    }
    const body = raw.slice(openBracket + 1, i);
    // Parse out the tuples in order and find the one at pageIdx.
    const tupleRe = /\[\s*("Page \d+")\s*,\s*("(?:[^"\\]|\\.)*")\s*\]/g;
    let match;
    let tupleIdx = 0;
    let targetStart = -1;
    let targetEnd = -1;
    let targetLabel = "";
    let targetText = "";
    while ((match = tupleRe.exec(body)) !== null) {
      if (tupleIdx === t.pageIdx) {
        targetStart = openBracket + 1 + match.index;
        targetEnd = targetStart + match[0].length;
        targetLabel = match[1];
        try {
          targetText = JSON.parse(match[2]);
        } catch {
          targetText = null;
        }
        break;
      }
      tupleIdx++;
    }
    if (targetStart < 0 || targetText === null) {
      console.warn(`  [skip] ${t.storyId} p${t.pageIdx + 1} — tuple not found`);
      continue;
    }
    const after = normalizeStoryText(targetText);
    if (after === targetText) {
      console.log(`  [noop] ${t.storyId} p${t.pageIdx + 1}`);
      continue;
    }
    console.log(`  [ts]   ${t.storyId} p${t.pageIdx + 1}`);
    console.log(`    before: ${targetText.slice(0, 110).replace(/\s+/g, " ")}…`);
    console.log(`    after : ${after.slice(0, 110).replace(/\s+/g, " ")}…`);
    const replacement = `[${targetLabel}, ${JSON.stringify(after)}]`;
    raw = raw.slice(0, targetStart) + replacement + raw.slice(targetEnd);
    tsChanges++;
  }
  if (tsChanges > 0) writeFileSync(p, raw);
  return tsChanges;
}

const classics7to10 = FAILED.filter((f) => f.source === "ts7to10");
const tsChanges = fixClassicTsFile("src/data/classicStories7to10.ts", classics7to10);

console.log(`\n✓ json changes: ${jsonChanges}, ts changes: ${tsChanges}`);
console.log(`Next: node scripts/generate-classic-audio.mjs + generate-builtin-audio.mjs`);
console.log(`Both will see null entries for these pages and regenerate them with clean text.`);
