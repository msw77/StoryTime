/**
 * Generate MULTI-VOICE TTS audio + Whisper word timestamps for classic stories.
 * Run with: node scripts/generate-classic-audio.mjs
 *
 * Each classic story has a voice map (classicVoiceMap.json) that assigns
 * OpenAI TTS voices to characters. The script:
 *   1. Splits each page's text into narration vs. dialogue segments
 *   2. Identifies the speaking character from attribution ("said X")
 *   3. Generates TTS for each segment in the character's voice
 *   4. Concatenates the MP3 segments into one page audio file
 *   5. Runs Whisper on the final file for word-level timestamps
 *
 * Result: stories sound like a mini radio play — narrator in Nova,
 * wolf in deep Onyx, little pigs in bright Shimmer/Alloy, etc.
 *
 * Saves MP3 files to public/audio/{storyId}/
 * Saves timestamp data to src/data/storyAudio.json (merged with existing)
 * Resumable: skips pages that already have complete audio + timestamps
 */

import OpenAI from "openai";
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load API key ────────────────────────────────────────────────────
const envPath = join(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const apiKey = envContent.match(/OPENAI_TTS_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) {
  console.error("OPENAI_TTS_KEY not found in .env.local");
  process.exit(1);
}
const openai = new OpenAI({ apiKey });

// ── Load voice map ──────────────────────────────────────────────────
const VOICE_MAP_PATH = join(__dirname, "..", "src", "data", "classicVoiceMap.json");
const voiceMap = JSON.parse(readFileSync(VOICE_MAP_PATH, "utf-8"));

// ── Parse classic stories from TypeScript source ────────────────────
function loadClassicStories(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const match = raw.match(/export const \w+:\s*Story\[\]\s*=\s*(\[[\s\S]*\]);/);
  if (!match) throw new Error("Could not parse classic stories from " + filePath);
  try {
    return JSON.parse(match[1]);
  } catch {
    return new Function("return " + match[1])();
  }
}

const CLASSIC_FILES = [
  join(__dirname, "..", "src", "data", "classicStories2to4.ts"),
  // Add more age groups here as they're created:
  // join(__dirname, "..", "src", "data", "classicStories4to7.ts"),
  // join(__dirname, "..", "src", "data", "classicStories7to10.ts"),
];

const allStories = [];
for (const file of CLASSIC_FILES) {
  if (existsSync(file)) {
    const stories = loadClassicStories(file);
    allStories.push(...stories);
    console.log(`Loaded ${stories.length} stories from ${file.split(/[\\/]/).pop()}`);
  }
}

if (allStories.length === 0) {
  console.error("No classic stories found!");
  process.exit(1);
}

// ── Load/create progress file ───────────────────────────────────────
const AUDIO_DATA_PATH = join(__dirname, "..", "src", "data", "storyAudio.json");
let audioData = {};
if (existsSync(AUDIO_DATA_PATH)) {
  audioData = JSON.parse(readFileSync(AUDIO_DATA_PATH, "utf-8"));
  console.log(`Loaded existing audio data: ${Object.keys(audioData).length} stories`);
}

const AUDIO_DIR = join(__dirname, "..", "public", "audio");
if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });

const SPEED = 1.0;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Dialogue parser ─────────────────────────────────────────────────
// Splits page text into segments of narration and character dialogue.
// Looks for quoted text and matches the speaker from attribution
// phrases like "said Pip", "called the wolf", "asked Baby Bear".

function splitPageIntoSegments(text, characters) {
  const segments = [];

  // Track the last identified speaker so we can carry it forward
  // when dialogue has no explicit attribution (e.g. consecutive lines
  // from the same character, or "She ran. 'Come back!'").
  let lastSpeaker = null;
  let lastVoice = "nova";

  // Match: "dialogue" + optional attribution
  const pattern = /\u201c([^\u201d]*)\u201d|"([^"]*)"/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Narration before this dialogue
    const before = text.slice(lastIndex, match.index).trim();
    if (before) {
      segments.push({ text: before, voice: "nova", type: "narration" });
      // Check if the narration mentions a character name — if so,
      // update lastSpeaker so unattributed dialogue right after
      // ("He smiled. 'Let's go!'") uses the right voice.
      const mentioned = findMentionedCharacter(before, characters);
      if (mentioned) {
        lastSpeaker = mentioned.name;
        lastVoice = mentioned.voice;
      }
    }

    const dialogue = match[1] || match[2];

    // ── Attribution AFTER the quote ─────────────────────────────
    // "dialogue" said the old farmer.
    const afterQuote = text.slice(match.index + match[0].length);
    const attrMatch = afterQuote.match(
      /^\s*(said|asked|called|roared|cried|sang|whispered|shouted|cheered|called out|replied|yelled|exclaimed|pleaded|begged|laughed|giggled|grumbled|growled|squeaked|with a smile)\s+(?:the\s+)?([^.,!?]+)/i
    );

    // ── Attribution BEFORE the quote ────────────────────────────
    // The wolf said "dialogue"
    const beforeQuote = text.slice(Math.max(0, match.index - 100), match.index);
    const preAttrMatch = beforeQuote.match(
      /(\w+(?:\s+\w+){0,3})\s+(?:said|asked|called|roared|cried|sang|whispered|shouted|replied|yelled|exclaimed)\s*[:,]?\s*$/i
    );

    let voice = "nova";
    let speaker = null;

    if (attrMatch) {
      speaker = attrMatch[2].toLowerCase().replace(/[.,!?].*$/, "").trim();
      voice = findVoice(speaker, characters);
    } else if (preAttrMatch) {
      speaker = preAttrMatch[1].toLowerCase().trim();
      voice = findVoice(speaker, characters);
    }

    // If we still couldn't identify the speaker, check if the
    // narration right before this quote mentions a character by name
    // or pronoun, and reuse that voice. This handles patterns like:
    //   "Goldilocks tasted the first bowl. 'Too hot!'"
    if (voice === "nova" && speaker === null) {
      // Check the immediate preceding text for a character name
      const nearby = text.slice(Math.max(0, match.index - 120), match.index);
      const mentioned = findMentionedCharacter(nearby, characters);
      if (mentioned) {
        voice = mentioned.voice;
        speaker = mentioned.name;
      } else if (lastSpeaker && lastVoice !== "nova") {
        // Last resort: reuse the most recent speaker
        voice = lastVoice;
        speaker = lastSpeaker;
      }
    }

    // Update last-speaker tracking
    if (speaker && voice !== "nova") {
      lastSpeaker = speaker;
      lastVoice = voice;
    }

    segments.push({
      text: `"${dialogue}"`,
      voice,
      type: "dialogue",
      speaker: speaker || "unknown",
    });

    // Include the attribution as narration (e.g., "said Pip.")
    if (attrMatch) {
      const fullAttr = attrMatch[0].trim();
      const attrStart = afterQuote.indexOf(fullAttr);
      const attrEnd = attrStart + fullAttr.length;
      // Grab any trailing punctuation too
      const attrText = afterQuote.slice(0, attrEnd).trim();
      if (attrText) {
        segments.push({ text: attrText, voice: "nova", type: "attribution" });
        lastIndex = match.index + match[0].length + attrEnd;
        pattern.lastIndex = lastIndex;
        continue;
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining narration after last dialogue
  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ text: remaining, voice: "nova", type: "narration" });
  }

  if (segments.length === 0) {
    segments.push({ text, voice: "nova", type: "narration" });
  }

  // Merge adjacent segments with the same voice to reduce TTS calls
  return mergeAdjacentSegments(segments);
}

// Scan a chunk of text for the last-mentioned character name.
// Returns {name, voice} or null. Used to assign voices to dialogue
// that doesn't have explicit "said X" attribution.
function findMentionedCharacter(text, characters) {
  if (!characters) return null;
  const lower = text.toLowerCase();
  let bestMatch = null;
  let bestPos = -1;

  for (const [name, voice] of Object.entries(characters)) {
    const pos = lower.lastIndexOf(name);
    if (pos > bestPos) {
      bestPos = pos;
      bestMatch = { name, voice };
    }
  }
  return bestMatch;
}

function findVoice(speaker, characters) {
  if (!characters) return "nova";

  // Direct match
  if (characters[speaker]) return characters[speaker];

  // Partial match: check if any character key is contained in the speaker
  for (const [name, voice] of Object.entries(characters)) {
    if (speaker.includes(name) || name.includes(speaker)) {
      return voice;
    }
  }

  return "nova";
}

function mergeAdjacentSegments(segments) {
  const merged = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.voice === seg.voice && seg.type !== "dialogue") {
      prev.text = prev.text + " " + seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  // Filter out empty segments
  return merged.filter((s) => s.text.trim().length > 0);
}

// ── TTS generation ──────────────────────────────────────────────────

async function generateSegmentAudio(text, voice) {
  const ttsResponse = await openai.audio.speech.create({
    model: "tts-1",
    voice,
    input: text,
    speed: SPEED,
    response_format: "mp3",
  });
  return Buffer.from(await ttsResponse.arrayBuffer());
}

async function generateMultiVoicePageAudio(storyId, pageIndex, text, characters) {
  const segments = splitPageIntoSegments(text, characters);
  const storyDir = join(AUDIO_DIR, storyId);
  if (!existsSync(storyDir)) mkdirSync(storyDir, { recursive: true });

  // Log the segment breakdown
  const voiceSummary = segments.map((s) => `${s.voice}(${s.type})`).join(" → ");
  console.log(`    Segments: ${voiceSummary}`);

  // Generate TTS for each segment
  const audioBuffers = [];
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const buf = await generateSegmentAudio(seg.text, seg.voice);
        audioBuffers.push(buf);
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        const waitTime = err.status === 429 ? 30000 : 5000 * attempt;
        await delay(waitTime);
      }
    }
    // Brief delay between segment TTS calls
    await delay(150);
  }

  // Concatenate all MP3 buffers into one file
  const fullBuffer = Buffer.concat(audioBuffers);
  const audioPath = join(storyDir, `page${pageIndex}.mp3`);
  writeFileSync(audioPath, fullBuffer);

  // Run Whisper on the concatenated file for word-level timestamps
  const whisperResponse = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: createReadStream(audioPath),
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  const wordTimings = (whisperResponse.words || []).map((w) => ({
    word: w.word,
    start: Math.round(w.start * 1000) / 1000,
    end: Math.round(w.end * 1000) / 1000,
  }));

  return {
    file: `/audio/${storyId}/page${pageIndex}.mp3`,
    duration: Math.round((whisperResponse.duration || 0) * 100) / 100,
    wordTimings,
    voices: segments.length, // track how many voice segments
  };
}

// ── Main ────────────────────────────────────────────────────────────
const totalPages = allStories.reduce((sum, s) => sum + s.pages.length, 0);
console.log(`\n🎭 Multi-voice audio generation for ${allStories.length} classic stories (${totalPages} pages)`);
console.log(`Voices: nova (narrator), shimmer, alloy, echo, fable, onyx (characters)`);
console.log("");

let totalCompleted = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const story of allStories) {
  const pageCount = story.pages.length;
  const storyVoices = voiceMap[story.id];

  if (!storyVoices) {
    console.log(`[WARN] No voice map for ${story.id} — using narrator only`);
  }

  const characters = storyVoices?.characters || {};

  // Check if already complete
  if (audioData[story.id] && audioData[story.id].length === pageCount) {
    const allComplete = audioData[story.id].every(
      (p) => p && p.wordTimings && p.wordTimings.length > 0
    );
    if (allComplete) {
      totalSkipped++;
      console.log(`[SKIP] ${story.title} — already complete`);
      continue;
    }
  }

  // Initialize array
  if (!audioData[story.id]) {
    audioData[story.id] = new Array(pageCount).fill(null);
  }

  console.log(`\n[${totalSkipped + totalCompleted + 1}/${allStories.length}] 📖 ${story.title} (${pageCount} pages)`);
  console.log(`  Characters: ${Object.entries(characters).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);

  let pagesGenerated = 0;
  let pagesFailed = 0;

  for (let i = 0; i < pageCount; i++) {
    // Skip pages already done
    if (
      audioData[story.id][i] &&
      audioData[story.id][i].wordTimings &&
      audioData[story.id][i].wordTimings.length > 0
    ) {
      pagesGenerated++;
      console.log(`  Page ${i + 1}/${pageCount} — already done`);
      continue;
    }

    const pageText = story.pages[i][1];
    console.log(`  Page ${i + 1}/${pageCount}:`);

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await generateMultiVoicePageAudio(
          story.id,
          i,
          pageText,
          characters
        );
        audioData[story.id][i] = {
          file: result.file,
          duration: result.duration,
          wordTimings: result.wordTimings,
        };
        pagesGenerated++;
        console.log(`    ✓ ${result.duration}s, ${result.voices} voice segments`);
        break;
      } catch (err) {
        if (attempt === 3) {
          console.error(`    ✗ FAILED after 3 attempts: ${err.message}`);
          pagesFailed++;
        } else {
          const waitTime = err.status === 429 ? 30000 : 5000 * attempt;
          console.log(`    Attempt ${attempt} failed, retrying in ${waitTime / 1000}s...`);
          await delay(waitTime);
        }
      }
    }

    // Delay between pages
    await delay(300);
  }

  // Save progress after each story
  writeFileSync(AUDIO_DATA_PATH, JSON.stringify(audioData, null, 2));

  if (pagesFailed > 0) {
    console.log(`  ${pagesGenerated}/${pageCount} pages (${pagesFailed} failed)`);
    totalFailed++;
  } else {
    console.log(`  ✓ All ${pagesGenerated} pages complete`);
  }
  totalCompleted++;

  await delay(500);
}

console.log("\n═══════════════════════════════════════");
console.log(`🎭 Done! Completed: ${totalCompleted}, Skipped: ${totalSkipped}, Failed: ${totalFailed}`);
console.log(`Total stories with audio: ${Object.keys(audioData).length}`);
console.log(`Output: ${AUDIO_DATA_PATH}`);
console.log(`Audio files: ${AUDIO_DIR}`);
