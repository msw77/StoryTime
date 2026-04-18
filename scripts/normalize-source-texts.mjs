/**
 * One-time source-text cleanup: apply the same digit→word / dash / hyphen /
 * quote normalization used by new custom stories to the EXISTING corpus
 * source files. This is the preemptive counterpart to the TTS validation
 * loop — it ensures TTS gets clean text from existing stories, not just
 * newly-generated ones.
 *
 * Scope:
 *   - src/data/generatedStories.json (builtin + history stories)
 *   - src/data/classicStories2to4.ts (classic stories, ages 2-4)
 *   - src/data/classicStories4to7.ts (classic stories, ages 4-7)
 *   - src/data/classicStories7to10.ts (classic stories, ages 7-10)
 *
 * Strategy:
 *   - JSON: parse, normalize each page.text, write back.
 *   - TS: use a targeted regex pass on the literal ["Page N", "<text>"]
 *     tuples. The TS files are generator output, not hand-written, so
 *     the format is stable enough for a regex replace to be safe.
 *
 * Run:
 *   node scripts/normalize-source-texts.mjs         # writes changes
 *   node scripts/normalize-source-texts.mjs --dry   # reports only
 *
 * After running, you almost certainly want to clear audio for any page
 * whose text changed and regenerate — otherwise display and audio will
 * disagree on those pages until TTS is re-run.
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { normalizeStoryText } from "./lib/text-normalize.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const DRY = process.argv.includes("--dry");

const changes = []; // { file, storyId, pageIdx, before, after }

// ── generatedStories.json ───────────────────────────────────────────
{
  const path = join(ROOT, "src", "data", "generatedStories.json");
  const data = JSON.parse(readFileSync(path, "utf-8"));
  for (const storyId of Object.keys(data)) {
    const story = data[storyId];
    if (!Array.isArray(story.pages)) continue;
    for (let i = 0; i < story.pages.length; i++) {
      const page = story.pages[i];
      if (!page || typeof page.text !== "string") continue;
      const after = normalizeStoryText(page.text);
      if (after !== page.text) {
        changes.push({
          file: "generatedStories.json",
          storyId,
          pageIdx: i,
          before: page.text,
          after,
        });
        page.pages ??= null; // no-op placeholder
        page.text = after;
      }
    }
  }
  if (!DRY) writeFileSync(path, JSON.stringify(data, null, 2));
}

// ── Classic TS files ────────────────────────────────────────────────
// Target the literal ["Page N", "…text…"] tuples. Skipping other string
// literals (title, description, originalAuthor, source guidance, etc.)
// keeps the rewrite narrow — we only touch text the TTS reads aloud.
function normalizeClassicsFile(relPath) {
  const path = join(ROOT, relPath);
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return;
  }

  // Find each "pages": [ ... ] array (there's one per story) and operate
  // only within those. Within each, rewrite the second string of each
  // [ "Page N", "text" ] tuple.
  let out = "";
  let cursor = 0;
  const pagesRe = /"pages":\s*\[/g;
  let m;
  while ((m = pagesRe.exec(raw)) !== null) {
    const openStart = m.index + m[0].length;
    // Walk forward matching brackets until the pages array closes.
    let depth = 1;
    let i = openStart;
    while (i < raw.length && depth > 0) {
      const ch = raw[i];
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
      if (depth === 0) break;
      i++;
    }
    const close = i; // position of closing ]
    out += raw.slice(cursor, openStart);

    const body = raw.slice(openStart, close);
    // Within body, rewrite each tuple's text string. The tuple shape is
    //   [ "Page N", "text with possible \"escapes\"" ]
    // We match the whole tuple and reconstruct it.
    const tupleRe = /\[\s*("Page \d+")\s*,\s*("(?:[^"\\]|\\.)*")\s*\]/g;
    const newBody = body.replace(tupleRe, (_tuple, label, textLit) => {
      // Parse the JSON-escaped string to a real string, normalize, re-stringify.
      let current;
      try {
        current = JSON.parse(textLit);
      } catch {
        return _tuple; // give up if we can't parse
      }
      const after = normalizeStoryText(current);
      if (after === current) return _tuple;
      // Extract story id from nearby context for reporting. Walk back
      // from tuple start to the most recent `"id": "..."` within the
      // enclosing story block.
      const offsetInRaw = openStart + body.indexOf(_tuple);
      const earlier = raw.slice(0, offsetInRaw);
      const idMatch = earlier.match(/"id":\s*"([^"]+)"[^}]*$/);
      const storyId = idMatch ? idMatch[1] : "(unknown)";
      changes.push({
        file: relPath.split(/[\\/]/).pop(),
        storyId,
        pageIdx: -1, // we don't bother computing — reporting is coarse
        before: current,
        after,
      });
      return `[${label}, ${JSON.stringify(after)}]`;
    });

    out += newBody;
    cursor = close;
    pagesRe.lastIndex = close; // skip past this pages array
  }
  out += raw.slice(cursor);

  if (!DRY && out !== raw) writeFileSync(path, out);
}

normalizeClassicsFile("src/data/classicStories2to4.ts");
normalizeClassicsFile("src/data/classicStories4to7.ts");
normalizeClassicsFile("src/data/classicStories7to10.ts");

// ── Report ──────────────────────────────────────────────────────────
console.log(`\nScanned corpus. Normalized ${changes.length} page texts.\n`);
// Group by story for readability
const byStory = {};
for (const c of changes) {
  const key = `${c.file}:${c.storyId}`;
  byStory[key] ??= [];
  byStory[key].push(c);
}
for (const [key, list] of Object.entries(byStory)) {
  console.log(`  ${key}  (${list.length} page${list.length === 1 ? "" : "s"})`);
  // Show one small diff sample per story.
  const sample = list[0];
  const shortBefore = sample.before.slice(0, 100).replace(/\s+/g, " ");
  const shortAfter = sample.after.slice(0, 100).replace(/\s+/g, " ");
  if (sample.before !== sample.after) {
    console.log(`    before: ${shortBefore}${sample.before.length > 100 ? "…" : ""}`);
    console.log(`    after : ${shortAfter}${sample.after.length > 100 ? "…" : ""}`);
  }
}
if (DRY) {
  console.log("\n(--dry — no files written)");
}
