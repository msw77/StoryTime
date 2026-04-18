import { readFileSync } from "fs";

const audio = JSON.parse(readFileSync("src/data/storyAudio.json", "utf-8"));
const ts = readFileSync("src/data/classicStories4to7.ts", "utf-8");

// Find the aladdin block and pull its pages
const startIdx = ts.indexOf('"id": "classic_aladdin');
if (startIdx < 0) {
  console.error("aladdin not found");
  process.exit(1);
}
// Take enough to cover all pages
const block = ts.slice(startIdx, startIdx + 6000);

// Match each ["Page N", "<text>"] entry
const pageRe = /\[\s*"Page \d+"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]/g;
const pageTexts = [];
let m;
while ((m = pageRe.exec(block)) !== null) {
  pageTexts.push(m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n"));
}

const storyId = "classic_aladdin";
console.log(`${storyId} — first ${Math.min(pageTexts.length, audio[storyId]?.length)} pages`);
console.log("page | display | whisper | dur | lastEnd | tailGap | missing");
for (let i = 0; i < Math.min(pageTexts.length, audio[storyId]?.length || 0); i++) {
  const dws = pageTexts[i].split(/\s+/).filter(Boolean).length;
  const p = audio[storyId][i];
  if (!p) continue;
  const whisperCount = p.wordTimings.filter(
    (t) => (t.word || "").replace(/[^\p{L}\p{N}]/gu, "").length > 0
  ).length;
  const lastEnd = p.wordTimings[p.wordTimings.length - 1].end;
  const missing = dws - whisperCount;
  console.log(
    `  ${i + 1}  |  ${dws}  |  ${whisperCount}  |  ${p.duration.toFixed(2)}s | ${lastEnd.toFixed(2)}s | ${(p.duration - lastEnd).toFixed(2)}s | ${missing}`
  );
}
