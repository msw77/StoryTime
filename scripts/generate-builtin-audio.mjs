/**
 * Generate TTS audio + Whisper word timestamps for all built-in stories.
 * Run with: node scripts/generate-builtin-audio.mjs
 *
 * - Generates nova voice audio for every page of every built-in story
 * - Runs Whisper on each audio clip for precise word-level timestamps
 * - Saves audio as MP3 files in public/audio/{storyId}/
 * - Saves timestamp data to src/data/storyAudio.json
 * - Resumable: skips pages that already have complete audio + timestamps
 */

import OpenAI from "openai";
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logApiUsage } from "./lib/cost-log.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load API key
const envPath = join(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const apiKey = envContent.match(/OPENAI_TTS_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) {
  console.error("OPENAI_TTS_KEY not found in .env.local");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

// Load stories
const storiesPath = join(__dirname, "..", "src", "data", "generatedStories.json");
const stories = JSON.parse(readFileSync(storiesPath, "utf-8"));
const storyIds = Object.keys(stories);

// Load/create progress file
const AUDIO_DATA_PATH = join(__dirname, "..", "src", "data", "storyAudio.json");
let audioData = {};
if (existsSync(AUDIO_DATA_PATH)) {
  audioData = JSON.parse(readFileSync(AUDIO_DATA_PATH, "utf-8"));
}

// Audio output directory
const AUDIO_DIR = join(__dirname, "..", "public", "audio");
if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });

const VOICE = "nova";
const SPEED = 1.0;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function generatePageAudio(storyId, pageIndex, text) {
  // Step 1: Generate TTS audio
  const ttsResponse = await openai.audio.speech.create({
    model: "tts-1",
    voice: VOICE,
    input: text,
    speed: SPEED,
    response_format: "mp3",
  });

  const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());

  // Fire-and-forget cost log for TTS call (priced by input char count).
  logApiUsage({
    provider: "openai",
    operation: "tts",
    model: "tts-1",
    inputChars: text.length,
    category: "builtin-generation",
    metadata: { storyId, pageIndex, voice: VOICE },
  });

  // Save MP3 file
  const storyDir = join(AUDIO_DIR, storyId);
  if (!existsSync(storyDir)) mkdirSync(storyDir, { recursive: true });
  const audioPath = join(storyDir, `page${pageIndex}.mp3`);
  writeFileSync(audioPath, audioBuffer);

  // Step 2: Run Whisper for precise word timestamps (use file stream)
  const whisperResponse = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: createReadStream(audioPath),
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  // Fire-and-forget Whisper cost log (priced by audio minute).
  logApiUsage({
    provider: "openai",
    operation: "whisper",
    audioSeconds: whisperResponse.duration ?? 0,
    category: "builtin-generation",
    metadata: { storyId, pageIndex },
  });

  const wordTimings = (whisperResponse.words || []).map((w) => ({
    word: w.word,
    start: Math.round(w.start * 1000) / 1000,  // Round to ms precision
    end: Math.round(w.end * 1000) / 1000,
  }));

  // ── Coverage validation ─────────────────────────────────────────
  // TTS occasionally truncates the input, producing audio shorter than
  // the source text. When that happens the last N display words get
  // orphaned and the reader skips them. Throwing here triggers the
  // outer retry loop (up to 3 attempts per page).
  const cleanLen = (w) => (w || "").replace(/[^\p{L}\p{N}]/gu, "").length;
  const displayWordCount = text.split(/\s+/).filter(Boolean).length;
  const whisperWordCount = wordTimings.filter((w) => cleanLen(w.word) > 0).length;
  const missing = displayWordCount - whisperWordCount;
  if (missing >= 3) {
    throw new Error(
      `TTS coverage short by ${missing} words (display=${displayWordCount} whisper=${whisperWordCount}) — likely TTS truncation, retrying`
    );
  }

  return {
    file: `/audio/${storyId}/page${pageIndex}.mp3`,
    duration: Math.round((whisperResponse.duration || 0) * 100) / 100,
    wordTimings,
  };
}

// ─── Main ────────────────────────────────────────────────────────────

const totalPages = Object.values(stories).reduce((s, st) => s + st.pages.length, 0);
console.log(`Generating audio for ${storyIds.length} stories (${totalPages} pages)`);
console.log(`Voice: ${VOICE}, Speed: ${SPEED}x`);
console.log("");

let totalCompleted = 0;
let totalSkipped = 0;
let totalFailed = 0;
let pagesProcessed = 0;

for (const storyId of storyIds) {
  const story = stories[storyId];
  const pageCount = story.pages.length;

  // Check if this story is already complete
  if (audioData[storyId] && audioData[storyId].length === pageCount) {
    const allComplete = audioData[storyId].every((p) => p && p.wordTimings && p.wordTimings.length > 0);
    if (allComplete) {
      totalSkipped++;
      pagesProcessed += pageCount;
      console.log(`[${totalSkipped + totalCompleted}/${storyIds.length}] ${story.title} — already complete, skipping`);
      continue;
    }
  }

  // Initialize array for this story
  if (!audioData[storyId]) {
    audioData[storyId] = new Array(pageCount).fill(null);
  }

  process.stdout.write(`[${totalSkipped + totalCompleted + 1}/${storyIds.length}] ${story.title} (${pageCount} pages)... `);

  let pagesGenerated = 0;
  let pagesFailed = 0;

  for (let i = 0; i < pageCount; i++) {
    // Skip pages that already have complete audio
    if (audioData[storyId][i] && audioData[storyId][i].wordTimings && audioData[storyId][i].wordTimings.length > 0) {
      pagesGenerated++;
      pagesProcessed++;
      continue;
    }

    const pageText = story.pages[i].text;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await generatePageAudio(storyId, i, pageText);
        audioData[storyId][i] = result;
        pagesGenerated++;
        pagesProcessed++;
        break;
      } catch (err) {
        if (attempt === 3) {
          console.log(`\n  ✗ Page ${i + 1} failed after 3 attempts: ${err.message}`);
          pagesFailed++;
          pagesProcessed++;
        } else {
          const waitTime = err.status === 429 ? 30000 : 5000 * attempt;
          await delay(waitTime);
        }
      }
    }

    // Progress indicator every 10 pages
    if (pagesProcessed % 10 === 0) {
      process.stdout.write(`[${pagesProcessed}/${totalPages}] `);
    }

    // Small delay between pages to avoid rate limits
    await delay(300);
  }

  // Save progress after each story
  writeFileSync(AUDIO_DATA_PATH, JSON.stringify(audioData, null, 2));

  if (pagesFailed > 0) {
    console.log(`${pagesGenerated}/${pageCount} pages (${pagesFailed} failed)`);
    totalFailed++;
  } else {
    console.log(`✓ ${pagesGenerated} pages`);
  }
  totalCompleted++;

  // Brief pause between stories
  await delay(500);
}

console.log("");
console.log(`Done! Completed: ${totalCompleted}, Skipped: ${totalSkipped}, Failed: ${totalFailed}`);
console.log(`Total pages processed: ${pagesProcessed}/${totalPages}`);
console.log(`Total stories with audio: ${Object.keys(audioData).length}`);
