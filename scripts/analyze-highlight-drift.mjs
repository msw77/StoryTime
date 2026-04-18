/**
 * Word-Highlight Drift Analyzer — Phase 0 (offline)
 *
 * Runs the EXACT same reconciliation algorithm that src/hooks/useSpeech.ts
 * uses at runtime, but against every page of every story in storyAudio.json.
 * Reports all the structural alignment problems we'd hit in the browser
 * without needing anyone to sit and play audio.
 *
 * What this catches (Phase 1 bugs):
 *   - Whisper token count vs display word count mismatches
 *   - Contractions where Whisper split "don't" into two tokens
 *   - Hyphenated words ("ten-year-old") tokenized in ways that scramble
 *     the char-offset mapper
 *   - Em-dash / en-dash handling
 *   - Numbers where text says "five" but Whisper heard "5"
 *   - Punctuation-only Whisper tokens that pile up on one display word
 *   - Cases where the reconciliation lands on a different word than
 *     a human would expect
 *
 * What this CANNOT catch (needs the browser overlay):
 *   - RAF tick jitter
 *   - React render-to-paint latency
 *   - Live speed-change behavior
 *   - Pause/resume races
 *
 * Run: node scripts/analyze-highlight-drift.mjs [--top=20] [--story=ID]
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── CLI args ─────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const TOP_N = Number(args.top ?? 20);
const STORY_FILTER = args.story;

// ── Load data ────────────────────────────────────────────────────────
const audio = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "data", "storyAudio.json"), "utf-8")
);
const stories = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "data", "generatedStories.json"), "utf-8")
);

// ── Reconciliation (mirrors useSpeech.ts lines 639-667) ──────────────
// Builds timingToDisplay[] mapping Whisper-token-index → display-word-index
// using character-offset alignment with letter-digit-only cleaning.
function reconcile(displayText, whisperTimings) {
  const allWords = displayText.split(/\s+/).filter(Boolean);
  const timings = whisperTimings;
  const displayLen = allWords.length;
  const timingsLen = timings.length;

  const clean = (w) => (w || "").replace(/[^\p{L}\p{N}]/gu, "");

  const displayStarts = new Array(displayLen);
  let pos = 0;
  for (let i = 0; i < displayLen; i++) {
    displayStarts[i] = pos;
    pos += clean(allWords[i]).length;
  }
  const totalCleanChars = pos;

  const timingToDisplay = new Array(timingsLen);
  let cursor = 0;
  let di = 0;
  for (let i = 0; i < timingsLen; i++) {
    const cleanLen = clean(timings[i].word).length;
    if (cleanLen > 0) {
      while (di + 1 < displayLen && displayStarts[di + 1] <= cursor) di++;
    }
    timingToDisplay[i] = di;
    cursor += cleanLen;
  }

  // Compute reverse map: displayIdx → [whisperIdx...] so we can flag
  // display words with 0 timings (no highlight fires) or >2 timings.
  const displayToTimings = new Array(displayLen).fill(null).map(() => []);
  for (let i = 0; i < timingsLen; i++) {
    displayToTimings[timingToDisplay[i]].push(i);
  }

  return { allWords, timings, timingToDisplay, displayToTimings, totalCleanChars, cursor };
}

// ── Per-page structural analysis ─────────────────────────────────────
function analyzePage(storyId, pageIdx, displayText, whisperTimings) {
  const r = reconcile(displayText, whisperTimings);
  const issues = [];

  // 1. Count sanity: if Whisper delivered wildly different word count
  //    than display, the mapping may be fine but structural drift is real.
  const whisperWithContent = r.timings.filter(
    (t) => t.word.replace(/[^\p{L}\p{N}]/gu, "").length > 0
  ).length;
  const countDelta = whisperWithContent - r.allWords.length;

  // 2. Char-sum sanity: after running the reconciler, does the cumulative
  //    Whisper char count match the display clean-char count? If not,
  //    TTS/Whisper saw different text than what we show → misalignment.
  const charDelta = r.cursor - r.totalCleanChars;

  // 3. Orphan display words: highlight never fires for these because no
  //    Whisper token maps to them. User sees this as the highlight
  //    "skipping" a word.
  const orphans = [];
  for (let di = 0; di < r.displayToTimings.length; di++) {
    if (r.displayToTimings[di].length === 0) {
      orphans.push({ displayIdx: di, word: r.allWords[di] });
    }
  }

  // 4. Pileups: display words that swallow many Whisper tokens. Likely
  //    caused by Whisper over-tokenizing (splitting a contraction or
  //    compound) in a way the char mapper then collapses back. Not
  //    strictly a bug, but it means multiple Whisper starts map to one
  //    highlight → the highlight's onset is the earliest, potentially
  //    lighting up the word before it's actually said.
  const pileups = [];
  for (let di = 0; di < r.displayToTimings.length; di++) {
    const tokens = r.displayToTimings[di];
    if (tokens.length >= 3) {
      pileups.push({
        displayIdx: di,
        word: r.allWords[di],
        tokenCount: tokens.length,
        tokenWords: tokens.map((ti) => r.timings[ti].word),
      });
    }
  }

  // 5. Cross-word Whisper tokens: a single Whisper token whose word text
  //    obviously spans a hyphen / compound. E.g. "ten-year-old" where
  //    Whisper returns one token per hyphen segment but display splits
  //    only on whitespace. Flag any timing word containing a hyphen.
  const hyphenTokens = r.timings
    .map((t, i) => ({ i, word: t.word }))
    .filter((t) => /[-\u2013\u2014]/.test(t.word));

  // 6. Categorize known trouble patterns in the source text.
  const patterns = {
    contractions: /\b\w+['\u2019]\w+\b/g,
    hyphenated: /\b\w+-\w+(-\w+)*\b/g,
    emDashes: /[\u2014]/g,
    enDashes: /[\u2013]/g,
    numerics: /\b\d+\b/g,
    curlyQuotes: /['\u2019\u201C\u201D]/g,
    ellipses: /\.{3,}|\u2026/g,
  };
  const textPatterns = {};
  for (const [k, re] of Object.entries(patterns)) {
    const matches = displayText.match(re) || [];
    if (matches.length > 0) textPatterns[k] = matches.slice(0, 5);
  }

  // Overall "severity" score so we can rank pages by how likely they
  // are to misbehave in the browser. Tunable later.
  const severity =
    Math.abs(countDelta) * 2 +
    Math.abs(charDelta) +
    orphans.length * 3 +
    pileups.length * 2 +
    hyphenTokens.length;

  if (
    countDelta !== 0 ||
    charDelta !== 0 ||
    orphans.length > 0 ||
    pileups.length > 0 ||
    hyphenTokens.length > 0
  ) {
    issues.push({
      storyId,
      pageIdx,
      displayWordCount: r.allWords.length,
      whisperTokenCount: whisperWithContent,
      countDelta,
      charDelta,
      orphans,
      pileups,
      hyphenTokens,
      textPatterns,
      severity,
    });
  }

  return { issues, reconciled: r };
}

// ── Run across corpus ────────────────────────────────────────────────
const allIssues = [];
const storyStats = {};
let totalPages = 0;
let cleanPages = 0;

for (const storyId of Object.keys(audio)) {
  if (STORY_FILTER && storyId !== STORY_FILTER) continue;
  const pages = audio[storyId];
  const storyDef = stories[storyId];
  if (!pages || !storyDef) continue;

  storyStats[storyId] = {
    title: storyDef.title,
    age: storyDef.age,
    pageCount: pages.length,
    issuePages: 0,
    totalOrphans: 0,
    totalPileups: 0,
    totalHyphenTokens: 0,
    totalCountDelta: 0,
    totalSeverity: 0,
  };

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    const textSrc = storyDef.pages[pi]?.text;
    if (!page?.wordTimings?.length || !textSrc) continue;
    totalPages++;

    const { issues } = analyzePage(storyId, pi, textSrc, page.wordTimings);

    if (issues.length === 0) {
      cleanPages++;
    } else {
      for (const iss of issues) {
        allIssues.push(iss);
        storyStats[storyId].issuePages++;
        storyStats[storyId].totalOrphans += iss.orphans.length;
        storyStats[storyId].totalPileups += iss.pileups.length;
        storyStats[storyId].totalHyphenTokens += iss.hyphenTokens.length;
        storyStats[storyId].totalCountDelta += Math.abs(iss.countDelta);
        storyStats[storyId].totalSeverity += iss.severity;
      }
    }
  }
}

// ── Aggregate pattern analysis ───────────────────────────────────────
const patternCounts = {
  contractions: 0,
  hyphenated: 0,
  emDashes: 0,
  enDashes: 0,
  numerics: 0,
  ellipses: 0,
};
for (const iss of allIssues) {
  for (const k of Object.keys(patternCounts)) {
    if (iss.textPatterns[k]) patternCounts[k]++;
  }
}

// ── Report ───────────────────────────────────────────────────────────
console.log("\n═══ WORD-HIGHLIGHT DRIFT ANALYSIS ═══\n");
console.log(`Corpus: ${Object.keys(audio).length} stories, ${totalPages} pages`);
console.log(`Clean pages: ${cleanPages} (${((cleanPages / totalPages) * 100).toFixed(1)}%)`);
console.log(`Pages with issues: ${totalPages - cleanPages}`);
console.log(`Total issues flagged: ${allIssues.length}\n`);

console.log("── TEXT PATTERN PREVALENCE (on pages with issues) ──");
for (const [k, v] of Object.entries(patternCounts)) {
  console.log(`  ${k.padEnd(14)} → ${v} pages`);
}

console.log("\n── AGGREGATED ISSUE COUNTS ──");
const totals = allIssues.reduce(
  (a, i) => ({
    orphans: a.orphans + i.orphans.length,
    pileups: a.pileups + i.pileups.length,
    hyphenTokens: a.hyphenTokens + i.hyphenTokens.length,
    countDelta: a.countDelta + Math.abs(i.countDelta),
    charDelta: a.charDelta + Math.abs(i.charDelta),
  }),
  { orphans: 0, pileups: 0, hyphenTokens: 0, countDelta: 0, charDelta: 0 }
);
console.log(`  Orphan display words (highlight skips):   ${totals.orphans}`);
console.log(`  Pileup display words (3+ tokens on 1):    ${totals.pileups}`);
console.log(`  Hyphen-containing Whisper tokens:         ${totals.hyphenTokens}`);
console.log(`  Sum |whisper - display word count|:       ${totals.countDelta}`);
console.log(`  Sum |clean-char-sum mismatch|:            ${totals.charDelta}`);

// ── Top offender pages ───────────────────────────────────────────────
console.log(`\n── TOP ${TOP_N} WORST PAGES (by severity score) ──`);
const sorted = [...allIssues].sort((a, b) => b.severity - a.severity);
for (const iss of sorted.slice(0, TOP_N)) {
  const title = stories[iss.storyId]?.title ?? iss.storyId;
  const age = stories[iss.storyId]?.age ?? "?";
  console.log(
    `\n  [${iss.severity}] ${iss.storyId} p${iss.pageIdx + 1}  "${title}"  (${age})`
  );
  console.log(
    `       words=${iss.displayWordCount} whisper=${iss.whisperTokenCount} Δ=${
      iss.countDelta >= 0 ? "+" : ""
    }${iss.countDelta}, charΔ=${iss.charDelta}`
  );
  if (iss.orphans.length > 0) {
    console.log(
      `       orphans: ${iss.orphans.map((o) => `[${o.displayIdx}]"${o.word}"`).join(" ")}`
    );
  }
  if (iss.pileups.length > 0) {
    console.log(
      `       pileups: ${iss.pileups
        .slice(0, 3)
        .map((p) => `"${p.word}"×${p.tokenCount}(${p.tokenWords.join("|")})`)
        .join(" ")}`
    );
  }
  if (iss.hyphenTokens.length > 0) {
    console.log(
      `       hyphen tokens: ${iss.hyphenTokens
        .slice(0, 4)
        .map((h) => `"${h.word}"`)
        .join(" ")}`
    );
  }
}

// ── Top offender stories ─────────────────────────────────────────────
const sortedStories = Object.entries(storyStats)
  .filter(([, s]) => s.issuePages > 0)
  .sort((a, b) => b[1].totalSeverity - a[1].totalSeverity);

console.log(`\n── TOP 10 WORST STORIES (by cumulative severity) ──`);
for (const [id, s] of sortedStories.slice(0, 10)) {
  console.log(
    `  [${s.totalSeverity}] ${id} "${s.title}" (${s.age}) — ${s.issuePages}/${s.pageCount} pages; orphans=${s.totalOrphans}, pileups=${s.totalPileups}, hyphens=${s.totalHyphenTokens}, countΔ=${s.totalCountDelta}`
  );
}

// ── Write full report to disk ────────────────────────────────────────
const outPath = join(__dirname, "..", "highlight-drift-report.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      summary: {
        totalStories: Object.keys(audio).length,
        totalPages,
        cleanPages,
        issuePages: totalPages - cleanPages,
        patternCounts,
        totals,
      },
      storyStats,
      issues: allIssues,
    },
    null,
    2
  )
);
console.log(`\nFull JSON report → ${outPath}`);
