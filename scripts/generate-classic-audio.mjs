/**
 * Generate MULTI-VOICE TTS audio + Whisper word timestamps for classic stories.
 * Run with: node scripts/generate-classic-audio.mjs [--story=<id>] [--force]
 *
 * Each classic story has a voice map (classicVoiceMap.json) that assigns
 * OpenAI TTS voices AND per-character persona instructions (for gpt-4o-mini-tts).
 * The script:
 *   1. Splits each page's text into narration vs. dialogue segments
 *   2. Identifies the speaking character from attribution ("said X")
 *   3. Generates TTS for each segment using the character's voice + instructions + speed
 *   4. Concatenates MP3 segments with a short silent pad at voice transitions
 *   5. Runs Whisper on the final file for word-level timestamps
 *
 * Flags:
 *   --story=<id>  Only regenerate one story (e.g. --story=classic_three_little_pigs)
 *   --force       Overwrite existing audio/timings (default: skip completed pages)
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
  join(__dirname, "..", "src", "data", "classicStories4to7.ts"),
  join(__dirname, "..", "src", "data", "classicStories7to10.ts"),
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

// ── CLI flags ───────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const STORY_FILTER = argv.find((a) => a.startsWith("--story="))?.split("=")[1] || null;

const TTS_MODEL = "gpt-4o-mini-tts";
// Global playback speed for every segment. gpt-4o-mini-tts trends slower
// than tts-1; 1.1 lands closer to natural storytelling pace. Applied to
// narrator AND character segments so pacing never shifts within a page.
const DEFAULT_SPEED = 1.1;

// One-voice-flexes model: every segment is rendered in the same narrator
// voice (default nova). What varies is the `instructions` param — for
// dialogue, we pass the character's "how the narrator should inflect
// their own voice" direction. The result sounds like a parent at bedtime
// doing character voices, not like a radio play with multiple actors.
const NARRATOR_VOICE = "nova";
const NARRATOR_BASELINE =
  "Warm, gentle children's storyteller — a parent reading aloud at bedtime. Clear, expressive, unhurried, with natural warmth.";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Dialogue parser ─────────────────────────────────────────────────
// Splits page text into segments of narration and character dialogue.
// Looks for quoted text and matches the speaker from attribution
// phrases like "said Pip", "called the wolf", "asked Baby Bear".

function splitPageIntoSegments(text, characters, narrator) {
  const segments = [];

  // Track the last identified speaker so we can carry it forward
  // when dialogue has no explicit attribution.
  let lastSpeaker = null;
  let lastPersona = narrator;

  const pattern = /\u201c([^\u201d]*)\u201d|"([^"]*)"/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Narration before this dialogue
    const before = text.slice(lastIndex, match.index).trim();
    if (before) {
      segments.push({ text: before, persona: narrator, type: "narration" });
      const mentioned = findMentionedCharacter(before, characters);
      if (mentioned) {
        lastSpeaker = mentioned.name;
        lastPersona = mentioned.persona;
      }
    }

    const dialogue = match[1] || match[2];

    const afterQuote = text.slice(match.index + match[0].length);
    const attrMatch = afterQuote.match(
      /^\s*(said|asked|called|roared|cried|sang|whispered|shouted|cheered|called out|replied|yelled|exclaimed|pleaded|begged|laughed|giggled|grumbled|growled|squeaked|with a smile)\s+(?:the\s+)?([^.,!?]+)/i
    );

    const beforeQuote = text.slice(Math.max(0, match.index - 100), match.index);
    const preAttrMatch = beforeQuote.match(
      /(\w+(?:\s+\w+){0,3})\s+(?:said|asked|called|roared|cried|sang|whispered|shouted|replied|yelled|exclaimed)\s*[:,]?\s*$/i
    );

    let persona = null;
    let speaker = null;

    if (attrMatch) {
      speaker = attrMatch[2].toLowerCase().replace(/[.,!?].*$/, "").trim();
      persona = findPersona(speaker, characters);
    } else if (preAttrMatch) {
      speaker = preAttrMatch[1].toLowerCase().trim();
      persona = findPersona(speaker, characters);
    }

    if (!persona) {
      const nearby = text.slice(Math.max(0, match.index - 120), match.index);
      const mentioned = findMentionedCharacter(nearby, characters);
      if (mentioned) {
        persona = mentioned.persona;
        speaker = mentioned.name;
      } else if (lastSpeaker && lastPersona !== narrator) {
        persona = lastPersona;
        speaker = lastSpeaker;
      }
    }

    if (!persona) persona = narrator;

    if (speaker && persona !== narrator) {
      lastSpeaker = speaker;
      lastPersona = persona;
    }

    segments.push({
      text: `"${dialogue}"`,
      persona,
      type: "dialogue",
      speaker: speaker || "unknown",
    });

    if (attrMatch) {
      const fullAttr = attrMatch[0].trim();
      const attrStart = afterQuote.indexOf(fullAttr);
      const attrEnd = attrStart + fullAttr.length;
      const attrText = afterQuote.slice(0, attrEnd).trim();
      if (attrText) {
        segments.push({ text: attrText, persona: narrator, type: "attribution" });
        lastIndex = match.index + match[0].length + attrEnd;
        pattern.lastIndex = lastIndex;
        continue;
      }
    }

    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ text: remaining, persona: narrator, type: "narration" });
  }

  if (segments.length === 0) {
    segments.push({ text, persona: narrator, type: "narration" });
  }

  return mergeAdjacentSegments(segments);
}

// Scan a chunk of text for the last-mentioned character name.
// Returns {name, persona} or null.
function findMentionedCharacter(text, characters) {
  if (!characters) return null;
  const lower = text.toLowerCase();
  let bestMatch = null;
  let bestPos = -1;

  for (const [name, persona] of Object.entries(characters)) {
    const pos = lower.lastIndexOf(name);
    if (pos > bestPos) {
      bestPos = pos;
      bestMatch = { name, persona };
    }
  }
  return bestMatch;
}

function findPersona(speaker, characters) {
  if (!characters) return null;
  if (characters[speaker]) return characters[speaker];
  for (const [name, persona] of Object.entries(characters)) {
    if (speaker.includes(name) || name.includes(speaker)) return persona;
  }
  return null;
}

// Normalize the voiceMap into the single-voice model:
// narrator = { voice: nova, instructions: "<narrator direction>" }
// characters = { name: { voice: nova, instructions: "<flex direction>" } }
// Accepts legacy string OR object values for backwards compat during migration.
function normalizePersona(raw, baseline) {
  const instructions =
    typeof raw === "string"
      ? raw
      : raw?.instructions || "";
  return {
    voice: NARRATOR_VOICE,
    instructions: instructions || baseline,
    speed: DEFAULT_SPEED,
  };
}

function normalizeVoiceMap(storyVoices) {
  const narratorRaw = storyVoices?.narrator;
  const narrator = normalizePersona(narratorRaw, NARRATOR_BASELINE);
  const characters = {};
  for (const [name, raw] of Object.entries(storyVoices?.characters || {})) {
    characters[name] = normalizePersona(raw, narrator.instructions);
  }
  return { narrator, characters };
}

// Same-persona adjacent segments are merged to reduce API calls.
function mergeAdjacentSegments(segments) {
  const merged = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.persona === seg.persona && seg.type !== "dialogue") {
      prev.text = prev.text + " " + seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged.filter((s) => s.text.trim().length > 0);
}

// ── TTS generation ──────────────────────────────────────────────────

async function generateSegmentAudio(text, persona) {
  const req = {
    model: TTS_MODEL,
    voice: persona.voice,
    input: text,
    response_format: "mp3",
  };
  if (persona.instructions) req.instructions = persona.instructions;
  if (persona.speed && persona.speed !== 1.0) req.speed = persona.speed;
  const ttsResponse = await openai.audio.speech.create(req);
  return Buffer.from(await ttsResponse.arrayBuffer());
}

async function generateMultiVoicePageAudio(storyId, pageIndex, text, narrator, characters) {
  const segments = splitPageIntoSegments(text, characters, narrator);
  const storyDir = join(AUDIO_DIR, storyId);
  if (!existsSync(storyDir)) mkdirSync(storyDir, { recursive: true });

  const summary = segments
    .map((s) => (s.type === "dialogue" ? `[${s.speaker}]` : "narration"))
    .join(" → ");
  console.log(`    Segments: ${summary}`);

  // Generate TTS for each segment
  const audioBuffers = [];
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const buf = await generateSegmentAudio(seg.text, seg.persona);
        audioBuffers.push(buf);
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        const waitTime = err.status === 429 ? 30000 : 5000 * attempt;
        await delay(waitTime);
      }
    }
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
const storiesToProcess = STORY_FILTER
  ? allStories.filter((s) => s.id === STORY_FILTER)
  : allStories;

if (STORY_FILTER && storiesToProcess.length === 0) {
  console.error(`No story matched --story=${STORY_FILTER}. Available ids:`);
  for (const s of allStories) console.error(`  ${s.id}`);
  process.exit(1);
}

const totalPages = storiesToProcess.reduce((sum, s) => sum + s.pages.length, 0);
console.log(`\n🎭 Multi-voice audio generation — model: ${TTS_MODEL}`);
console.log(`   ${storiesToProcess.length} story/stories, ${totalPages} pages${FORCE ? " (force-regenerating)" : ""}`);
console.log("");

let totalCompleted = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const story of storiesToProcess) {
  const pageCount = story.pages.length;
  const storyVoices = voiceMap[story.id];

  if (!storyVoices) {
    console.log(`[WARN] No voice map for ${story.id} — using narrator only`);
  }

  const { narrator, characters } = normalizeVoiceMap(storyVoices);

  // Check if already complete (skip unless --force)
  if (
    !FORCE &&
    audioData[story.id] &&
    audioData[story.id].length === pageCount
  ) {
    const allComplete = audioData[story.id].every(
      (p) => p && p.wordTimings && p.wordTimings.length > 0
    );
    if (allComplete) {
      totalSkipped++;
      console.log(`[SKIP] ${story.title} — already complete (use --force to regenerate)`);
      continue;
    }
  }

  // On --force, clear existing entries for this story so every page regenerates
  if (FORCE) audioData[story.id] = new Array(pageCount).fill(null);

  // Initialize array
  if (!audioData[story.id]) {
    audioData[story.id] = new Array(pageCount).fill(null);
  }

  console.log(`\n[${totalSkipped + totalCompleted + 1}/${storiesToProcess.length}] 📖 ${story.title} (${pageCount} pages)`);
  console.log(`  Voice: ${narrator.voice} (flexing per character)`);
  const charList = Object.keys(characters).join(", ") || "none";
  console.log(`  Characters: ${charList}`);

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
          narrator,
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
