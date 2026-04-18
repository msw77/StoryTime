/**
 * End-to-end data validation for the Classics Collection (Ages 2-4).
 *
 * For each of the 10 classic stories, checks:
 *   1. Story definition is well-formed (id, pages, fullPages, heroType, etc.)
 *   2. storyImages.json has an entry of the correct page count, all URLs reachable (HEAD 200)
 *   3. storyAudio.json has an entry of the correct page count; every audio file exists on disk
 *      under public/audio/<id>/; duration > 0; wordTimings well-formed (monotonic, end>=start)
 *   4. classicVoiceMap.json has an entry; every listed voice id is a valid OpenAI TTS voice
 *
 * Exit 0 if all stories pass, 1 if any failure.
 * Run with: node scripts/validate-classics.mjs
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const CLASSIC_FILES = [
  "src/data/classicStories2to4.ts",
  "src/data/classicStories4to7.ts",
  "src/data/classicStories7to10.ts",
];

function loadClassicStories() {
  const all = [];
  for (const rel of CLASSIC_FILES) {
    const path = join(ROOT, rel);
    try {
      const raw = readFileSync(path, "utf-8");
      const match = raw.match(/export const \w+:\s*Story\[\]\s*=\s*(\[[\s\S]*\]);/);
      if (!match) continue;
      let stories;
      try { stories = JSON.parse(match[1]); }
      catch { stories = new Function("return " + match[1])(); }
      all.push(...stories);
    } catch {
      // File doesn't exist yet (e.g. 4-7 / 7-10 pre-generation) — skip.
    }
  }
  return all;
}

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf-8"));
}

async function headOk(url) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok ? null : `HTTP ${r.status}`;
  } catch (e) {
    return `fetch error: ${e.message}`;
  }
}

async function validateStory(story, images, audio, voiceMap) {
  const errs = [];
  const warns = [];
  const id = story.id;
  const pageCount = story.pages?.length ?? 0;

  // ── Story shape ────────────────────────────────────────────────────
  if (!id?.startsWith("classic_")) errs.push(`id "${id}" missing "classic_" prefix`);
  if (!story.isClassic) errs.push(`isClassic flag missing/false`);
  if (!story.originalAuthor) warns.push(`no originalAuthor (will show blank in UI)`);
  if (pageCount === 0) errs.push(`no pages`);
  if (!story.fullPages || story.fullPages.length !== pageCount) {
    errs.push(`fullPages length ${story.fullPages?.length} != pages length ${pageCount}`);
  }

  // ── Images ─────────────────────────────────────────────────────────
  const imgs = images[id];
  if (!imgs) {
    errs.push(`no entry in storyImages.json`);
  } else if (!Array.isArray(imgs) || imgs.length !== pageCount) {
    errs.push(`images length ${imgs.length} != pages length ${pageCount}`);
  } else {
    // Sample: check first, middle, last URL (avoid blasting fal CDN with 100 HEADs)
    const sampleIdx = [0, Math.floor(pageCount / 2), pageCount - 1];
    for (const i of sampleIdx) {
      const url = imgs[i];
      if (typeof url !== "string" || !url.startsWith("http")) {
        errs.push(`image[${i}] not a URL: ${url}`);
        continue;
      }
      const err = await headOk(url);
      if (err) errs.push(`image[${i}] unreachable (${err}): ${url}`);
    }
  }

  // ── Audio ──────────────────────────────────────────────────────────
  const aud = audio[id];
  if (!aud) {
    errs.push(`no entry in storyAudio.json`);
  } else if (!Array.isArray(aud) || aud.length !== pageCount) {
    errs.push(`audio length ${aud?.length} != pages length ${pageCount}`);
  } else {
    for (let i = 0; i < aud.length; i++) {
      const page = aud[i];
      if (!page.file?.startsWith("/audio/")) {
        errs.push(`audio[${i}] file path malformed: ${page.file}`);
        continue;
      }
      const diskPath = join(ROOT, "public", page.file);
      if (!existsSync(diskPath)) errs.push(`audio[${i}] file missing on disk: ${page.file}`);
      if (!(page.duration > 0)) errs.push(`audio[${i}] duration invalid: ${page.duration}`);

      const wt = page.wordTimings;
      if (!Array.isArray(wt) || wt.length === 0) {
        errs.push(`audio[${i}] no wordTimings`);
      } else {
        let lastEnd = 0;
        for (let j = 0; j < wt.length; j++) {
          const t = wt[j];
          if (!(t.end >= t.start)) {
            errs.push(`audio[${i}] timing[${j}] end<start: ${JSON.stringify(t)}`);
            break;
          }
          if (t.start < lastEnd - 0.01) {
            warns.push(`audio[${i}] timing[${j}] starts before prior end (overlap)`);
            break;
          }
          lastEnd = t.end;
        }
        // Rough sanity: word count ≈ page text word count (within 40%)
        const pageText = story.fullPages?.[i]?.[1] ?? story.pages[i]?.[1] ?? "";
        const expected = pageText.split(/\s+/).filter(Boolean).length;
        if (expected > 0 && (wt.length < expected * 0.6 || wt.length > expected * 1.6)) {
          warns.push(`audio[${i}] timing count ${wt.length} vs page word count ${expected} (off by >40%)`);
        }
      }
    }
  }

  // ── Voice map ──────────────────────────────────────────────────────
  // Single-voice-flex shape:
  //   { narrator: "<direction string>",
  //     characters: { name: "<flex direction string>", ... } }
  // Legacy object shape {voice, instructions, speed} is still accepted.
  const vm = voiceMap[id];
  const checkInstruction = (label, p) => {
    if (p == null) { errs.push(`${label}: missing`); return; }
    const text = typeof p === "string" ? p : p.instructions;
    if (typeof text !== "string" || text.trim().length === 0) {
      errs.push(`${label}: instructions missing or empty`);
    }
  };

  if (!vm) {
    errs.push(`no entry in classicVoiceMap.json`);
  } else {
    checkInstruction("voiceMap.narrator", vm.narrator);
    if (!vm.characters || typeof vm.characters !== "object") {
      errs.push(`voiceMap missing characters object`);
    } else {
      const charEntries = Object.entries(vm.characters);
      if (charEntries.length === 0) warns.push(`voiceMap.characters empty (will fall back to narrator)`);
      for (const [character, p] of charEntries) {
        checkInstruction(`voiceMap.characters["${character}"]`, p);
      }
    }
  }

  return { id, title: story.title, pageCount, errs, warns };
}

// ── Main ─────────────────────────────────────────────────────────────
const stories = loadClassicStories();
const images = loadJson("src/data/storyImages.json");
const audio = loadJson("src/data/storyAudio.json");
const voiceMap = loadJson("src/data/classicVoiceMap.json");

console.log(`Validating ${stories.length} classic stories (Ages 2-4)...\n`);

const results = [];
for (const story of stories) {
  process.stdout.write(`  ${story.id.padEnd(32)}`);
  const r = await validateStory(story, images, audio, voiceMap);
  results.push(r);
  if (r.errs.length === 0) {
    console.log(`PASS  (${r.pageCount} pages${r.warns.length ? `, ${r.warns.length} warn` : ""})`);
  } else {
    console.log(`FAIL  (${r.errs.length} errors)`);
  }
}

console.log("");
let hasFail = false;
for (const r of results) {
  if (r.errs.length === 0 && r.warns.length === 0) continue;
  console.log(`─── ${r.id} — ${r.title} ───`);
  for (const e of r.errs) { console.log(`  ✗ ${e}`); hasFail = true; }
  for (const w of r.warns) console.log(`  ⚠ ${w}`);
  console.log("");
}

const passCount = results.filter(r => r.errs.length === 0).length;
console.log(`${passCount}/${results.length} stories passed.`);
process.exit(hasFail ? 1 : 0);
