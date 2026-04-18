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

// ── Reconciliation v2 (mirrors src/lib/wordTimings.ts) ───────────────
// Produces per-display-word start times, interpolating orphan words
// between nearest real anchors so the highlight never skips. We still
// surface the raw structural counts (orphans, pileups, char-sum deltas)
// for visibility — they're now "would-have-been-skipped" events
// rather than "will-be-skipped" events.
function reconcileV2(displayText, whisperTimings, audioDurationSec) {
  const cleanChars = (w) => (w || "").replace(/[^\p{L}\p{N}]/gu, "");
  const displayWords = displayText.split(/\s+/).filter(Boolean);
  const displayLen = displayWords.length;
  if (displayLen === 0) {
    return {
      displayWords: [],
      displayStartTimes: [],
      isAnchor: [],
      orphanCount: 0,
      pileupCount: 0,
    };
  }
  const displayCharLens = new Array(displayLen);
  const displayCharStarts = new Array(displayLen);
  let p = 0;
  for (let i = 0; i < displayLen; i++) {
    displayCharStarts[i] = p;
    displayCharLens[i] = cleanChars(displayWords[i]).length;
    p += displayCharLens[i];
  }
  const displayMidpoints = displayCharStarts.map(
    (s, i) => s + displayCharLens[i] / 2
  );
  const displayAnchorStart = new Array(displayLen).fill(null);
  const displayTokenCount = new Array(displayLen).fill(0);
  let cursor = 0;
  let di = 0;
  for (let i = 0; i < whisperTimings.length; i++) {
    const cleanLen = cleanChars(whisperTimings[i].word).length;
    if (cleanLen > 0) {
      while (di + 1 < displayLen && displayCharStarts[di + 1] <= cursor) di++;
    }
    displayTokenCount[di]++;
    if (displayAnchorStart[di] === null) {
      displayAnchorStart[di] = whisperTimings[i].start;
    }
    cursor += cleanLen;
  }
  const anchorIdxs = [];
  for (let i = 0; i < displayLen; i++) {
    if (displayAnchorStart[i] !== null) anchorIdxs.push(i);
  }
  const displayStartTimes = new Array(displayLen);
  const isAnchor = new Array(displayLen);
  if (anchorIdxs.length === 0) {
    const total = audioDurationSec ?? displayLen * 0.2;
    for (let i = 0; i < displayLen; i++) {
      displayStartTimes[i] = (i / displayLen) * total;
      isAnchor[i] = false;
    }
    return {
      displayWords,
      displayStartTimes,
      isAnchor,
      orphanCount: displayLen,
      pileupCount: 0,
    };
  }
  let nextCursor = 0;
  for (let i = 0; i < displayLen; i++) {
    if (displayAnchorStart[i] !== null) {
      displayStartTimes[i] = displayAnchorStart[i];
      isAnchor[i] = true;
      continue;
    }
    isAnchor[i] = false;
    let prevAnchor = -1;
    for (let a = anchorIdxs.length - 1; a >= 0; a--) {
      if (anchorIdxs[a] <= i) {
        prevAnchor = anchorIdxs[a];
        break;
      }
    }
    while (nextCursor < anchorIdxs.length && anchorIdxs[nextCursor] <= i) {
      nextCursor++;
    }
    const nextAnchor =
      nextCursor < anchorIdxs.length ? anchorIdxs[nextCursor] : -1;
    if (prevAnchor === -1 && nextAnchor === -1) {
      displayStartTimes[i] = 0;
    } else if (prevAnchor === -1) {
      displayStartTimes[i] = displayAnchorStart[nextAnchor];
    } else if (nextAnchor === -1) {
      const prevTime = displayAnchorStart[prevAnchor];
      const endTime =
        audioDurationSec !== undefined && audioDurationSec > prevTime
          ? audioDurationSec
          : prevTime + (displayLen - prevAnchor) * 0.2;
      const totalSpan =
        displayMidpoints[displayLen - 1] +
        displayCharLens[displayLen - 1] / 2 -
        displayMidpoints[prevAnchor];
      const myOff = displayMidpoints[i] - displayMidpoints[prevAnchor];
      const frac = totalSpan > 0 ? myOff / totalSpan : 0;
      displayStartTimes[i] = prevTime + (endTime - prevTime) * frac;
    } else {
      const prevTime = displayAnchorStart[prevAnchor];
      const nextTime = displayAnchorStart[nextAnchor];
      const totalSpan =
        displayMidpoints[nextAnchor] - displayMidpoints[prevAnchor];
      const myOff = displayMidpoints[i] - displayMidpoints[prevAnchor];
      const frac = totalSpan > 0 ? myOff / totalSpan : 0;
      displayStartTimes[i] = prevTime + (nextTime - prevTime) * frac;
    }
  }
  for (let i = 1; i < displayLen; i++) {
    if (displayStartTimes[i] <= displayStartTimes[i - 1]) {
      displayStartTimes[i] = displayStartTimes[i - 1] + 0.001;
    }
  }
  const orphanCount = displayLen - anchorIdxs.length;
  const pileupCount = displayTokenCount.filter((c) => c >= 3).length;
  return {
    displayWords,
    displayStartTimes,
    isAnchor,
    orphanCount,
    pileupCount,
  };
}

// ── Reconciliation v1 (the pre-2026-04-18 algorithm; kept for compare) ─
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
// v2 interpolation metrics: how much SYNTHETIC time each orphan got.
// Big gaps (>800ms of synthetic per orphan) still look janky even with
// interpolation — the highlight crawls through a stretch with no real
// anchor. Small gaps (<200ms) are imperceptible. We want to know both.
let v2TotalOrphans = 0;
let v2TotalInterpSeconds = 0;
let v2MaxInterpSpan = 0;
let v2OrphansOver500 = 0;
let v2OrphansOver1000 = 0;
const v2BadInterpPages = [];

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

    // ── v2 pass: run the new reconciler and measure residual impact ──
    const v2 = reconcileV2(textSrc, page.wordTimings, page.duration);
    v2TotalOrphans += v2.orphanCount;
    // Measure max interpolated gap on this page: look for runs of
    // consecutive non-anchor words and sum the time they span.
    let worstSpan = 0;
    let runStart = -1;
    for (let i = 0; i < v2.isAnchor.length; i++) {
      if (!v2.isAnchor[i]) {
        if (runStart === -1) runStart = i;
      } else if (runStart !== -1) {
        const spanStart = runStart === 0 ? 0 : v2.displayStartTimes[runStart - 1];
        const spanEnd = v2.displayStartTimes[i];
        const span = spanEnd - spanStart;
        v2TotalInterpSeconds += span;
        if (span > worstSpan) worstSpan = span;
        // Per-orphan drift: span / (orphansInRun + 1)
        const runLen = i - runStart;
        const perOrphan = span / (runLen + 1);
        if (perOrphan > 0.5) v2OrphansOver500 += runLen;
        if (perOrphan > 1.0) v2OrphansOver1000 += runLen;
        runStart = -1;
      }
    }
    // Handle run running to end of page
    if (runStart !== -1) {
      const spanStart = runStart === 0 ? 0 : v2.displayStartTimes[runStart - 1];
      const spanEnd = v2.displayStartTimes[v2.isAnchor.length - 1];
      const span = spanEnd - spanStart;
      v2TotalInterpSeconds += span;
      if (span > worstSpan) worstSpan = span;
    }
    if (worstSpan > v2MaxInterpSpan) v2MaxInterpSpan = worstSpan;
    if (worstSpan > 2.0) {
      v2BadInterpPages.push({
        storyId,
        pageIdx: pi,
        title: storyDef.title,
        worstSpan,
        orphanCount: v2.orphanCount,
      });
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
console.log(`Clean pages (no structural issues): ${cleanPages} (${((cleanPages / totalPages) * 100).toFixed(1)}%)`);
console.log(`Pages with issues: ${totalPages - cleanPages}`);
console.log(`Total issues flagged: ${allIssues.length}\n`);

console.log("── RECONCILER V2 (with orphan-time interpolation) ──");
console.log(`  Orphan words still flagged structurally:  ${v2TotalOrphans}`);
console.log(`  * but now none are SKIPPED — all have synthetic timings`);
console.log(`  Total synthetic timing coverage:          ${v2TotalInterpSeconds.toFixed(1)}s across corpus`);
console.log(`  Worst single-run synthetic span:          ${v2MaxInterpSpan.toFixed(2)}s`);
console.log(`  Orphans with >500ms of synthetic time:    ${v2OrphansOver500}`);
console.log(`  Orphans with >1000ms of synthetic time:   ${v2OrphansOver1000}`);
console.log(`  Pages with >2s interpolated spans:        ${v2BadInterpPages.length}`);
if (v2BadInterpPages.length > 0) {
  console.log("  Worst interp-span pages:");
  v2BadInterpPages
    .sort((a, b) => b.worstSpan - a.worstSpan)
    .slice(0, 8)
    .forEach((p) =>
      console.log(
        `    ${p.storyId} p${p.pageIdx + 1} "${p.title}" — ${p.worstSpan.toFixed(2)}s, ${p.orphanCount} orphans`
      )
    );
}
console.log("");

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
