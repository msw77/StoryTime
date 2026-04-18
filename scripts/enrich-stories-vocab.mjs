/**
 * Enrich existing stories with Science-of-Reading metadata WITHOUT
 * regenerating the narrative text, scene prompts, audio, or images.
 *
 * Input:  an existing Story with pages[] + fullPages[]
 * Output: the same Story, now with:
 *           - fullPages[i].vocabWords         (3–5 per page, age-scaled defs)
 *           - fullPages[i].readAloudWords     (2–3 per page, phonetic syllables)
 *           - comprehensionQuestions          (story-level, age 4+ only)
 *           - predictionPause                 (story-level, age 4+ only)
 *
 * The text, scenes, moods, sounds, and chapterTitles are passed through
 * unchanged. Existing audio (public/audio/STORY_ID/*.mp3 + storyAudio.json
 * word timings) and images (storyImages.json) stay valid because the
 * display text hasn't changed.
 *
 * Cost: roughly ~$0.04-0.08 per story in Claude tokens (input: the full
 * existing text ~1-2k tokens; output: ~5-10k tokens of metadata). Much
 * cheaper than a full regen and zero fal.ai cost.
 *
 * Run:
 *   node scripts/enrich-stories-vocab.mjs --age=4-7 --story=cinderella
 *   node scripts/enrich-stories-vocab.mjs --age=4-7 --all
 *   node scripts/enrich-stories-vocab.mjs --scope=classics --all
 *   node scripts/enrich-stories-vocab.mjs --scope=builtin --all
 *
 * Flags:
 *   --story=<id>   Enrich only one story (by short name or full id)
 *   --all          Enrich every story in scope
 *   --scope=       classics-2-4 | classics-4-7 | classics-7-10 |
 *                  builtin | all  (default: classics-4-7)
 *   --force        Overwrite existing vocab/comprehension fields. By
 *                  default we skip stories that already have vocabWords
 *                  on at least one page.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logApiUsage } from "./lib/cost-log.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ── CLI ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const args = Object.fromEntries(
  argv.map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const STORY_FILTER = args.story;
const ALL = !!args.all;
const SCOPE = args.scope || "classics-4-7";
const FORCE = !!args.force;

if (!STORY_FILTER && !ALL) {
  console.error("Provide --story=<id> OR --all");
  process.exit(1);
}

// ── Claude ───────────────────────────────────────────────────────────
const envPath = join(ROOT, ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const apiKey = envContent.match(/STORYTIME_ANTHROPIC_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) {
  console.error("STORYTIME_ANTHROPIC_KEY not found in .env.local");
  process.exit(1);
}
const anthropic = new Anthropic({ apiKey });
const MODEL = "claude-sonnet-4-20250514";

// ── Story loaders per scope ──────────────────────────────────────────
// Classic files are TypeScript — we parse them by extracting the array
// literal with the same regex the audio generator uses.
function loadClassics(rel) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  const m = raw.match(/export const \w+:\s*Story\[\]\s*=\s*(\[[\s\S]*\]);/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]);
  } catch {
    return new Function("return " + m[1])();
  }
}

function saveClassics(rel, stories) {
  const path = join(ROOT, rel);
  const raw = readFileSync(path, "utf-8");
  // Replace the exported literal with the new JSON. We preserve the
  // declaration line so TypeScript typing stays intact.
  const replaced = raw.replace(
    /(export const \w+:\s*Story\[\]\s*=\s*)(\[[\s\S]*\])(;)/,
    (_m, prefix, _body, suffix) =>
      `${prefix}${JSON.stringify(stories, null, 2)}${suffix}`,
  );
  writeFileSync(path, replaced);
}

const CLASSIC_FILES = {
  "classics-2-4": "src/data/classicStories2to4.ts",
  "classics-4-7": "src/data/classicStories4to7.ts",
  "classics-7-10": "src/data/classicStories7to10.ts",
};

// ── The enrichment prompt ────────────────────────────────────────────
// Single prompt. Input: story title + full ordered pages text. Output:
// ONLY the reading-science metadata. We intentionally do NOT ask Claude
// to echo the story text back (that would burn tokens and introduce
// drift risk). The caller merges output into the existing Story object.
function buildPrompt(story) {
  const age = story.age;
  const pageCount = story.pages.length;
  const pageBlock = story.pages
    .map(([label, text], i) => `[page ${i + 1}] ${text}`)
    .join("\n\n");

  return `You are enriching an existing children's picture book with Science-of-Reading metadata. The narrative text is FINAL and must NOT change. You produce ONLY the reading-science fields that power the Word Glow, Sound It Out, and comprehension features.

Story title: ${story.title}
Age band: ${age}
Page count: ${pageCount}

Existing page text (do NOT modify):
${pageBlock}

## Your task
Return a single JSON object with the following shape. All field names are required unless explicitly marked optional.

{
  "pages": [
    {
      "pageIdx": 0,
      "vocabWords": [
        {
          "word": "<exact word as it appears on this page>",
          "emoji": "<one emoji evoking the meaning>",
          "definition_2_4": ${age === "2-4" ? `"<simple sentence for 2-4yo>"` : "null"},
          "definition_4_7": "<one sentence, 8-14 words, everyday language>",
          "definition_7_10": "<one sentence, 12-20 words, slightly richer, may use light metaphor>",
          "exampleSentence": "<one sentence using the word in a DIFFERENT context from the story>",
          "pronunciation": "<capitalized syllabic form, e.g. CAN-yun, eh-KOH>"
        }
      ],
      "readAloudWords": [
        {
          "word": "<exact word as it appears>",
          "syllables": ["<phonetic syllable 1>", "<phonetic syllable 2>"],
          "phonicsLevel": "easy" | "intermediate" | "hard"
        }
      ]
    },
    ... one entry per page in order, pageIdx 0..${pageCount - 1}
  ]${age === "2-4" ? "" : `,
  "comprehensionQuestions": [
    {
      "type": "recall" | "inference" | "connection",
      "question": "<warm, conversational question>",
      "options": [
        { "text": "<answer>", "emoji": "<emoji>", "correct": true | false },
        { "text": "<answer>", "emoji": "<emoji>", "correct": true | false },
        { "text": "<answer>", "emoji": "<emoji>", "correct": true | false }
      ]
    }
  ],
  "predictionPause": {
    "atPageIdx": <0-indexed page at mid-story tension point>,
    "question": "<what do you think happens next? phrasing>",
    "options": [
      { "text": "<plausible prediction>", "emoji": "<emoji>" },
      { "text": "<plausible prediction>", "emoji": "<emoji>" },
      { "text": "<plausible prediction>", "emoji": "<emoji>" }
    ]
  }`}
}

## Rules

Per page:
- vocabWords: 3–5 per page. Words just above the age-${age} comfortable reading level — challenging but reachable from context. Favor concrete nouns, vivid verbs, sensory adjectives. Avoid words a kid that age already knows from daily life ("house", "ran", "happy"). The "word" must be a word that actually appears in that page's text (exact match, case-preserving).
- readAloudWords: 2–3 per page (overlap with vocabWords is fine). Syllables are PHONETIC (how it's SPOKEN), not orthographic. "table" → ["tay", "bul"]. Single-syllable → one-element array.
- phonicsLevel: 'easy' (CVC, short vowels) | 'intermediate' (long vowels, digraphs, r-controlled) | 'hard' (irregular, multi-syll, schwa).

${age === "2-4" ? "" : `Story-level:
- comprehensionQuestions: ${age === "4-7" ? "2–3 questions" : "3 questions"}. Exactly 3 options each. One correct for recall/inference; all three correct for connection questions (they're about the kid's feelings, not facts). Warm and conversational phrasing — never "Which of the following..."
- predictionPause: exactly 1 per story. Choose the page with peak "what happens next" tension — usually after setup but before climax.

`}Return ONLY the JSON object. No markdown fences, no commentary.`;
}

async function enrichStory(story) {
  const prompt = buildPrompt(story);
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  // Cost log — category distinguishes this from full-regen so the
  // dashboard can break out spend.
  logApiUsage({
    provider: "anthropic",
    operation: "story-enrich",
    model: MODEL,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    category: "reading-science-enrich",
    metadata: { storyId: story.id, age: story.age },
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock) throw new Error("No text block in response");
  const raw = textBlock.text
    .trim()
    .replace(/^```json\s*/, "")
    .replace(/\s*```$/, "");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Claude occasionally emits an unescaped quote inside a string.
    // Function eval is more forgiving; last-resort parse.
    try {
      parsed = new Function("return " + raw)();
    } catch {
      throw e;
    }
  }

  if (!Array.isArray(parsed.pages) || parsed.pages.length !== story.pages.length) {
    throw new Error(
      `Expected ${story.pages.length} enriched pages, got ${parsed.pages?.length}`,
    );
  }
  return parsed;
}

function mergeEnriched(story, enriched) {
  // Non-destructive merge: preserves every existing field, adds the
  // new reading-science fields where they belong.
  const fullPages = (story.fullPages || []).map((fp, i) => ({
    ...fp,
    vocabWords: enriched.pages[i]?.vocabWords ?? [],
    readAloudWords: enriched.pages[i]?.readAloudWords ?? [],
  }));

  const out = { ...story, fullPages };
  if (enriched.comprehensionQuestions)
    out.comprehensionQuestions = enriched.comprehensionQuestions;
  if (enriched.predictionPause) out.predictionPause = enriched.predictionPause;
  return out;
}

function alreadyEnriched(story) {
  const pages = story.fullPages || [];
  return pages.some(
    (p) => Array.isArray(p.vocabWords) && p.vocabWords.length > 0,
  );
}

// ── Resolve scope → list of (file, stories) ──────────────────────────
const scopes = [];
if (SCOPE === "all") {
  for (const k of Object.keys(CLASSIC_FILES)) scopes.push({ file: CLASSIC_FILES[k], kind: "classics" });
} else if (SCOPE in CLASSIC_FILES) {
  scopes.push({ file: CLASSIC_FILES[SCOPE], kind: "classics" });
} else if (SCOPE === "builtin") {
  scopes.push({ file: "src/data/generatedStories.json", kind: "builtin" });
} else {
  console.error(`Unknown --scope=${SCOPE}`);
  process.exit(1);
}

// ── Main loop ────────────────────────────────────────────────────────
let total = 0, succeeded = 0, skipped = 0, failed = 0;

for (const { file, kind } of scopes) {
  console.log(`\n── ${file} (${kind}) ──`);

  if (kind === "classics") {
    const stories = loadClassics(file);
    const targets = STORY_FILTER
      ? stories.filter((s) => s.id === STORY_FILTER || s.id.endsWith("_" + STORY_FILTER))
      : stories;

    for (let i = 0; i < targets.length; i++) {
      const s = targets[i];
      total++;
      if (!FORCE && alreadyEnriched(s)) {
        console.log(`  [skip] ${s.id} — already enriched`);
        skipped++;
        continue;
      }
      process.stdout.write(`  [${i + 1}/${targets.length}] ${s.title}... `);
      try {
        const enriched = await enrichStory(s);
        const merged = mergeEnriched(s, enriched);
        const origIdx = stories.findIndex((x) => x.id === s.id);
        stories[origIdx] = merged;
        saveClassics(file, stories); // incremental save for resumability
        succeeded++;
        const vocabCount = merged.fullPages?.reduce(
          (n, p) => n + (p.vocabWords?.length || 0),
          0,
        );
        console.log(`✓ ${vocabCount} vocab words`);
      } catch (err) {
        console.log(`✗ ${err.message}`);
        failed++;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  } else {
    // builtin: generatedStories.json (object keyed by story id)
    const path = join(ROOT, file);
    const store = JSON.parse(readFileSync(path, "utf-8"));
    const ids = STORY_FILTER
      ? Object.keys(store).filter((id) => id === STORY_FILTER)
      : Object.keys(store);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const story = store[id];
      total++;
      // Builtin stories have a slightly different shape — normalize.
      const normalized = {
        id,
        title: story.title,
        age: story.age,
        pages: story.pages,
        fullPages: story.pages.map((p) => ({
          scene: p.scene,
          mood: p.mood,
          sounds: p.sounds,
          vocabWords: p.vocabWords,
          readAloudWords: p.readAloudWords,
        })),
      };
      if (!FORCE && normalized.fullPages.some((p) => Array.isArray(p.vocabWords) && p.vocabWords.length > 0)) {
        console.log(`  [skip] ${id} — already enriched`);
        skipped++;
        continue;
      }
      // Normalize pages to [label, text] tuples for the prompt.
      const pagesAsTuples = story.pages.map((p, idx) => {
        if (Array.isArray(p)) return p;
        return [p.label ?? `Page ${idx + 1}`, p.text];
      });
      const promptStory = { ...normalized, pages: pagesAsTuples };
      process.stdout.write(`  [${i + 1}/${ids.length}] ${story.title}... `);
      try {
        const enriched = await enrichStory(promptStory);
        // Merge back into the builtin object-shape (page objects).
        for (let pi = 0; pi < story.pages.length; pi++) {
          store[id].pages[pi].vocabWords = enriched.pages[pi]?.vocabWords ?? [];
          store[id].pages[pi].readAloudWords = enriched.pages[pi]?.readAloudWords ?? [];
        }
        if (enriched.comprehensionQuestions)
          store[id].comprehensionQuestions = enriched.comprehensionQuestions;
        if (enriched.predictionPause) store[id].predictionPause = enriched.predictionPause;
        writeFileSync(path, JSON.stringify(store, null, 2));
        succeeded++;
        const vocabCount = enriched.pages.reduce(
          (n, p) => n + (p.vocabWords?.length || 0),
          0,
        );
        console.log(`✓ ${vocabCount} vocab words`);
      } catch (err) {
        console.log(`✗ ${err.message}`);
        failed++;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

console.log(
  `\nDone. total=${total} succeeded=${succeeded} skipped=${skipped} failed=${failed}`,
);
