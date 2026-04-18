/**
 * Generate retold classic stories for Ages 4-7 and Ages 7-10 using Claude API.
 * Run with:
 *   node scripts/generate-classic-stories.mjs --age=4-7 --story=cinderella
 *   node scripts/generate-classic-stories.mjs --age=4-7 --all
 *   node scripts/generate-classic-stories.mjs --age=7-10 --all
 *
 * Output:
 *   src/data/classicStories4to7.ts   (10 stories, ~13 pages each)
 *   src/data/classicStories7to10.ts  (10 stories, ~18 pages each with chapters)
 *   src/data/classicVoiceMap.json    (appended with per-story voice maps)
 *
 * Each generation call produces a full Story object (including pages + fullPages
 * with scene/mood/sounds) and a voice map for that story's characters.
 *
 * Resumable: skips stories whose id already appears in the output TS file unless
 * --force is passed.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ── Env ─────────────────────────────────────────────────────────────
const envPath = join(ROOT, ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const apiKey = envContent.match(/STORYTIME_ANTHROPIC_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) {
  console.error("STORYTIME_ANTHROPIC_KEY not found in .env.local");
  process.exit(1);
}
const anthropic = new Anthropic({ apiKey });
const MODEL = "claude-opus-4-7";

// ── Story definitions ───────────────────────────────────────────────
// Each def: id, shortName (CLI matcher), title, emoji, color, originalAuthor,
// description (short one-line for the library), sourceGuidance (a hint to
// Claude about which version to retell from).
const STORIES_4_7 = [
  { id: "classic_cinderella",         shortName: "cinderella",        title: "Cinderella",                       emoji: "👠", color: "#c86b85",
    originalAuthor: "Brothers Grimm",
    description: "A kind girl, a magic hazel tree, and a night she'll never forget.",
    sourceGuidance: "Retell the Brothers Grimm version (hazel tree on mother's grave, doves helping her, no fairy godmother). Ages 4-7 appropriate — softer than the original." },

  { id: "classic_rapunzel",           shortName: "rapunzel",          title: "Rapunzel",                         emoji: "👒", color: "#b08968",
    originalAuthor: "Brothers Grimm",
    description: "A girl in a tall tower with the longest hair you've ever seen.",
    sourceGuidance: "Brothers Grimm version. Gentle retelling — the witch is stern but not terrifying." },

  { id: "classic_elves_shoemaker",    shortName: "elves-shoemaker",   title: "The Elves and the Shoemaker",      emoji: "👞", color: "#8b6b43",
    originalAuthor: "Brothers Grimm",
    description: "A kind shoemaker, tiny magical helpers, and a secret midnight gift.",
    sourceGuidance: "Brothers Grimm. Warm and cozy throughout." },

  { id: "classic_thumbelina",         shortName: "thumbelina",        title: "Thumbelina",                       emoji: "🌷", color: "#d4679a",
    originalAuthor: "Hans Christian Andersen",
    description: "A tiny girl no bigger than a thumb finds her way home.",
    sourceGuidance: "Andersen. The toad and beetle scenes can be comic/awkward rather than scary. Ends with her finding the flower people." },

  { id: "classic_puss_in_boots",      shortName: "puss-in-boots",     title: "Puss in Boots",                    emoji: "🐈", color: "#a04b2e",
    originalAuthor: "Charles Perrault",
    description: "A clever cat with fine boots and a plan to make his master a king.",
    sourceGuidance: "Perrault. Playful trickster energy. The ogre can be transformed harmlessly at the end (no violence)." },

  { id: "classic_snow_queen",         shortName: "snow-queen",        title: "The Snow Queen",                   emoji: "❄️", color: "#6b90b5",
    originalAuthor: "Hans Christian Andersen",
    description: "A brave girl travels far to save her dearest friend.",
    sourceGuidance: "Andersen — SIMPLIFIED to the core adventure (Gerda travels to find Kai). Skip the splinter details; focus on Gerda's journey and love thawing Kai's heart." },

  { id: "classic_rumpelstiltskin",    shortName: "rumpelstiltskin",   title: "Rumpelstiltskin",                  emoji: "🌾", color: "#b8a240",
    originalAuthor: "Brothers Grimm",
    description: "A strange little man, straw spun into gold, and a very tricky name.",
    sourceGuidance: "Brothers Grimm. Ending: Rumpelstiltskin stamps his foot and disappears (no tearing himself in two)." },

  { id: "classic_pinocchio",          shortName: "pinocchio",         title: "Pinocchio",                        emoji: "🪵", color: "#8b5a2b",
    originalAuthor: "Carlo Collodi",
    description: "A wooden puppet who learns what it means to be truly real.",
    sourceGuidance: "Collodi's core story arc — wanting to be a real boy, lies making his nose grow, learning the value of honesty. Soften darker plot points." },

  { id: "classic_aladdin",            shortName: "aladdin",           title: "Aladdin and the Magic Lamp",       emoji: "🪔", color: "#b8860b",
    originalAuthor: "One Thousand and One Nights",
    description: "A poor boy, an old lamp, and the genie inside.",
    sourceGuidance: "ORIGINAL Arabian Nights version — NOT the Disney version. Aladdin is a poor boy in an unnamed Chinese/Arabian city. Two genies (ring and lamp). Original character designs." },

  { id: "classic_bremen_musicians",   shortName: "bremen-musicians",  title: "The Bremen Town Musicians",        emoji: "🎻", color: "#9c6e3a",
    originalAuthor: "Brothers Grimm",
    description: "Four old animals set off on the road to make music together.",
    sourceGuidance: "Brothers Grimm. Comic tone. Donkey, dog, cat, rooster scare the robbers with their 'music' and keep the cozy cottage." },
];

const STORIES_7_10 = [
  { id: "classic_alice_wonderland",   shortName: "alice",             title: "Alice's Adventures in Wonderland", emoji: "🐇", color: "#5a9b6e",
    originalAuthor: "Lewis Carroll",
    description: "Down a rabbit-hole, into a world where nothing is quite as it seems.",
    sourceGuidance: "Carroll. Condensed retelling hitting the White Rabbit, falling down, shrinking/growing, Caterpillar, Cheshire Cat, Mad Tea Party, Queen of Hearts, waking up. Original character designs — Alice should NOT wear a blue dress and white apron." },

  { id: "classic_jungle_book",        shortName: "jungle-book",       title: "The Jungle Book",                  emoji: "🐅", color: "#4d7c2e",
    originalAuthor: "Rudyard Kipling",
    description: "Mowgli, the boy raised by wolves, grows up in the jungle.",
    sourceGuidance: "Kipling's Mowgli story. Bagheera, Baloo, the wolf pack, Shere Khan as antagonist. Original character designs — NOT Disney." },

  { id: "classic_wizard_oz",          shortName: "wizard-oz",         title: "The Wonderful Wizard of Oz",       emoji: "🌪️", color: "#7ca642",
    originalAuthor: "L. Frank Baum",
    description: "A cyclone carries Dorothy to a land of witches, wizards, and new friends.",
    sourceGuidance: "Baum. Dorothy's journey down the yellow brick road with Scarecrow, Tin Man, Cowardly Lion to meet the Wizard. Silver slippers in the original (not ruby). Original character designs." },

  { id: "classic_robin_hood",         shortName: "robin-hood",        title: "Robin Hood",                       emoji: "🏹", color: "#4a6b2f",
    originalAuthor: "English folklore",
    description: "An outlaw in Sherwood Forest who takes from the rich to help the poor.",
    sourceGuidance: "Classic folk-tale retelling. Key episodes woven into one arc — meeting Little John on the bridge, Friar Tuck, Marian, the archery contest, the Sheriff of Nottingham." },

  { id: "classic_treasure_island",    shortName: "treasure-island",   title: "Treasure Island",                  emoji: "🏴‍☠️", color: "#2d5f74",
    originalAuthor: "Robert Louis Stevenson",
    description: "A boy, a map, and a pirate with a wooden leg.",
    sourceGuidance: "Stevenson. Jim Hawkins, the treasure map, Long John Silver (complex — charming AND dangerous), the voyage and mutiny. Condensed." },

  { id: "classic_wind_willows",       shortName: "wind-willows",      title: "The Wind in the Willows — Toad's Wild Ride",
    emoji: "🐸", color: "#6a8c3e",
    originalAuthor: "Kenneth Grahame",
    description: "Mr. Toad's motor-car obsession leads his friends on a wild adventure.",
    sourceGuidance: "Grahame. Focus on Toad's motor-car storyline with Rat, Mole, Badger helping reform him. Cozy English countryside feel." },

  { id: "classic_pied_piper",         shortName: "pied-piper",        title: "The Pied Piper of Hamelin",        emoji: "🎶", color: "#9c5a2e",
    originalAuthor: "Robert Browning",
    description: "A mysterious piper makes a bargain with the town of Hamelin.",
    sourceGuidance: "Softened retelling. In this version the piper takes the children to a wonderful hidden valley where they learn and grow, and they eventually return — no tragic ending." },

  { id: "classic_rip_van_winkle",     shortName: "rip-van-winkle",    title: "Rip Van Winkle",                   emoji: "⛰️", color: "#6b7a8e",
    originalAuthor: "Washington Irving",
    description: "A man takes a nap in the mountains and wakes up twenty years later.",
    sourceGuidance: "Irving. Gentle humor. The strange bowling men in the mountains, Rip's long sleep, coming home to a changed world." },

  { id: "classic_secret_garden",      shortName: "secret-garden",     title: "The Secret Garden",                emoji: "🌹", color: "#7a4b5c",
    originalAuthor: "Frances Hodgson Burnett",
    description: "A lonely girl, a hidden garden, and the magic of making things grow.",
    sourceGuidance: "Burnett. Mary discovers the hidden garden, meets Dickon and Colin, the garden and friendship heal all three. Condensed." },

  { id: "classic_perseus_medusa",     shortName: "perseus-medusa",    title: "Perseus and Medusa",               emoji: "⚔️", color: "#8b6f3a",
    originalAuthor: "Greek mythology",
    description: "A young hero, a gorgon's mirror, and a quest across the sea.",
    sourceGuidance: "Greek myth retelling. Perseus, Athena's gifts (the mirror-shield, winged sandals), defeating Medusa by looking only at her reflection, rescuing Andromeda. Gentle — Medusa is 'defeated' not graphically killed." },
];

// ── CLI ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const AGE = argv.find((a) => a.startsWith("--age="))?.split("=")[1];
const STORY_FILTER = argv.find((a) => a.startsWith("--story="))?.split("=")[1] || null;
const ALL = argv.includes("--all");
const FORCE = argv.includes("--force");

if (!AGE || !["4-7", "7-10"].includes(AGE)) {
  console.error("Usage: node scripts/generate-classic-stories.mjs --age=<4-7|7-10> (--story=<shortName> | --all) [--force]");
  process.exit(1);
}
if (!STORY_FILTER && !ALL) {
  console.error("Must pass either --story=<shortName> or --all");
  process.exit(1);
}

const STORIES = AGE === "4-7" ? STORIES_4_7 : STORIES_7_10;
const PAGE_COUNT = AGE === "4-7" ? 13 : 18;
// Ages 7-10 stories get 3-5 chapters — Claude picks the count that best
// fits the story's natural arc. 3 chapters = ~6 pages each (bigger acts);
// 5 chapters = ~3-4 pages each (snappier pacing).
const CHAPTER_MIN = AGE === "7-10" ? 3 : 0;
const CHAPTER_MAX = AGE === "7-10" ? 5 : 0;

const storiesToGenerate = STORY_FILTER
  ? STORIES.filter((s) => s.shortName === STORY_FILTER)
  : STORIES;

if (STORY_FILTER && storiesToGenerate.length === 0) {
  console.error(`No story matched --story=${STORY_FILTER}. Available:`);
  for (const s of STORIES) console.error(`  ${s.shortName}`);
  process.exit(1);
}

// ── File paths ──────────────────────────────────────────────────────
const TS_FILE = join(ROOT, "src", "data", AGE === "4-7" ? "classicStories4to7.ts" : "classicStories7to10.ts");
const EXPORT_NAME = AGE === "4-7" ? "CLASSIC_STORIES_4_7" : "CLASSIC_STORIES_7_10";
const VOICE_MAP_FILE = join(ROOT, "src", "data", "classicVoiceMap.json");

// Load existing stories from the TS file (if any)
function loadExistingStories() {
  if (!existsSync(TS_FILE)) return [];
  const raw = readFileSync(TS_FILE, "utf-8");
  const match = raw.match(/export const \w+:\s*Story\[\]\s*=\s*(\[[\s\S]*\]);/);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

function writeTsFile(stories) {
  const header =
`import { Story } from "@/types/story";

// Classic retold public domain stories for ages ${AGE}
// Generated by scripts/generate-classic-stories.mjs

export const ${EXPORT_NAME}: Story[] = `;
  const body = JSON.stringify(stories, null, 2);
  writeFileSync(TS_FILE, header + body + ";\n");
}

function loadVoiceMap() {
  if (!existsSync(VOICE_MAP_FILE)) return {};
  return JSON.parse(readFileSync(VOICE_MAP_FILE, "utf-8"));
}
function writeVoiceMap(map) {
  writeFileSync(VOICE_MAP_FILE, JSON.stringify(map, null, 2) + "\n");
}

// ── Prompt ──────────────────────────────────────────────────────────
const WRITING_RULES = `
# StoryTime Classics — Writing Rules

You are retelling a classic public-domain children's story for the StoryTime app.
Tone: warm, gentle, vivid, like a beloved storyteller reading aloud to a child.
NEVER scary or violent. Even dark source material must be softened.

## Language, pacing, and complexity by age

### Ages 4-7 (~30-50 words per page, 13 pages)
- Richer vocabulary than 2-4 but still conversational. A 5-year-old should understand every sentence on first listen.
- Sentence length: mostly 8-16 words. Mix in short punchy sentences for pacing.
- Describe feelings and sensory details ("her heart thumped", "the soup was so hot it steamed").
- Characters have distinct voices in dialogue — different word choices for different characters.
- Concepts: kindness, bravery, friendship, fairness, trying again, telling the truth. Age-appropriate — no existential angst, no moral ambiguity. Good is clearly good, trouble is clearly trouble.
- Tension should be gentle — "oh no, the wolf is coming!" not genuine dread.
- Onomatopoeia and light alliteration are welcome ("snip-snap went the scissors").
- AVOID: multi-clause sentences with nested subordinates, rare/literary vocabulary, abstract moral reasoning, irony kids can't parse, romance as a theme (princes and princesses can simply become "friends" or "married" without elaboration).

### Ages 7-10 (~60-80 words per page, 18 pages, with chapters)
- Literary but accessible. A 9-year-old reading alone should feel challenged but not lost.
- Varied sentence structure — short punchy lines AND longer flowing ones. Compound sentences welcome.
- Include foreshadowing, tension, mild humor, and internal character thoughts ("Alice couldn't help feeling curious, though her mother's warnings rang in her ears").
- Subplots and side characters where the source material supports it.
- Themes: courage, cleverness, growing up, loyalty, loss, identity. Complexity allowed — antagonists can have motivations; heroes can doubt themselves.
- Chapter titles should be evocative and set a mood ("The Thing in the Hedge", "What the Cat Knew").
- Vocabulary may include occasional stretch words if context makes meaning clear.
- Still NO graphic violence, NO on-page cruelty, NO romantic content beyond "married and were happy."

## Violence and death
- Ages 4-7: No character dies on-page. They "run away," "disappear," or "learn their lesson." No graphic violence, no suffering in detail.
- Ages 7-10: Characters MAY pass away if the original story requires it, but handle death GENTLY and OFF-PAGE. Focus on emotional impact — loss, courage, remembrance — not the act.

## Trademark avoidance (CRITICAL)
These prompts go to an AI image generator. You MUST NOT produce anything that could look like a trademarked adaptation.
- NO Disney-style designs. No Disney blue Cinderella dress, no Disney Aladdin look, no Alice in blue dress + white apron, etc.
- NO DreamWorks / Pixar / Ghibli / any film-TV aesthetic.
- Create ORIGINAL character appearances that look distinctly different from any famous adaptation.
- Include the literal phrase "original character design, not based on any existing adaptation" in EVERY scene prompt.
- Cinderella: give her an entirely different hair/dress/build than Disney.
- Aladdin: original Arabian Nights setting, original design, NOT Disney.
- Alice: NOT a blue dress + white apron.
- When in doubt, make it look NOTHING like the famous version.

## Scene prompt specification
Each fullPages entry needs a VERY specific scene description (~80-120 words). Include:
- Character appearance (hair color, clothing, expression, age, posture) — and reuse the SAME description on every page the character appears (consistency is critical).
- Setting details (time of day, weather, indoor/outdoor, key objects).
- Composition (foreground vs background, perspective, what's in focus).
- Lighting and color mood (warm golden light, cool moonlit blue, etc.).
- Start every scene with: "Soft watercolor children's book illustration, original character design, not based on any existing adaptation."

## Mood field (choose one per page)
peaceful, exciting, funny, mysterious, warm, triumphant, tense, magical, bittersweet, cozy

## Sounds field
An array of 2-4 short sound descriptions that match the scene (e.g. "autumn wind whooshing", "footsteps on wooden floor", "cat purring"). Ambient + specific.
`;

const SAMPLE_STORY = `
## Example output format (this is the Three Little Pigs for Ages 2-4 — yours must be LONGER and age-appropriate)

\`\`\`json
{
  "story": {
    "id": "classic_three_little_pigs",
    "title": "The Three Little Pigs",
    "emoji": "🐷",
    "color": "#b8860b",
    "genre": "classics",
    "age": "2-4",
    "isClassic": true,
    "originalAuthor": "Joseph Jacobs",
    "description": "Three pigs build houses, but only one can stand up to the big bad wolf.",
    "duration": "3",
    "pages": [
      ["Page 1", "Once there were three little pigs. Pip, Pat, and Penny. It was time to build their own homes!"],
      ["Page 2", "Pip built his house out of straw. Swish, swish, swish! It went up so fast. \\"All done!\\" said Pip."]
    ],
    "fullPages": [
      {
        "scene": "Soft watercolor children's book illustration, original character design, not based on any existing adaptation. Three little pigs standing together on a sunny green hilltop...",
        "mood": "warm",
        "sounds": ["birds singing in morning sun", "gentle breeze through meadow grass"]
      }
    ]
  },
  "voiceMap": {
    "narrator": "Warm bedtime storyteller voice — a parent reading aloud, clear and expressive. Maintain a natural, steady storytelling pace throughout — do not speed up or slow down.",
    "characters": {
      "pip": "Same storyteller voice, lifted brighter and a little lazy-eager — playing a carefree young piglet.",
      "wolf": "Same storyteller voice, dropped low with a growly, smirking villain inflection — playing a cartoonish big-bad wolf for young kids. Playful, not frightening."
    }
  }
}
\`\`\`

The voice map uses the "one narrator voice that flexes" model — characters all use the SAME narrator voice but with persona-specific inflection instructions. NEVER write pacing words like "fast", "slow", "measured", "quick" in character instructions — only pitch/tone/emotion/personality. Character keys should be lowercase short names matching how the characters are named in the story (first name or role like "wolf", "stepmother", "hen").
`;

function buildUserPrompt(def) {
  const chapterInstr =
    AGE === "7-10"
      ? `\n\n## Chapters — REQUIRED
This story MUST have between ${CHAPTER_MIN} and ${CHAPTER_MAX} chapters (inclusive). The generation will be REJECTED if the count falls outside this range. Choose the count that best fits the natural arc — 3 for sweeping epics, 5 for episodic stories.

Implementation: on the FIRST page of each chapter, set \`chapterTitle\` to a short evocative title (e.g. "Down the Rabbit Hole" — don't include the word "Chapter" in the title; the app prepends "Chapter N" automatically). On continuation pages within the same chapter, omit \`chapterTitle\` or set it to null.

Count the chapterTitles in your output before returning. If you have fewer than ${CHAPTER_MIN} or more than ${CHAPTER_MAX}, regroup your pages and adjust.

Make chapter titles sing — they set the mood. Aim for chapters of roughly equal size.`
      : "";

  return `Retell the classic story below as a children's picture book for Ages ${AGE}.

Story: **${def.title}**
Original author / source: ${def.originalAuthor}
Short description (for library card): ${def.description}
Source guidance: ${def.sourceGuidance}

## Requirements
- Exactly ${PAGE_COUNT} pages.
- Each page is a [label, text] tuple where label is "Page N" (1-indexed).
- ${AGE === "4-7" ? "Each page: 30-50 words of text, punchy and vivid. Follow the Ages 4-7 language rules above strictly." : "Each page: 60-80 words of text. Follow the Ages 7-10 language rules above strictly."}
- Each page gets a matching fullPages entry (scene, mood, sounds) — the same length array as pages.${chapterInstr}
- id: "${def.id}"
- emoji: "${def.emoji}"
- color: "${def.color}"
- genre: "classics"
- age: "${AGE}"
- isClassic: true
- originalAuthor: "${def.originalAuthor}"
- description: "${def.description}"
- duration: "${AGE === "4-7" ? "5" : "10"}"

## Voice map
Alongside the story, produce a voiceMap with:
- narrator: one sentence describing the storyteller voice direction (end with "Maintain a natural, steady storytelling pace throughout — do not speed up or slow down.")
- characters: { lowercase-name: "Same storyteller voice, [pitch/tone only — no pacing words] — playing <character role>." }
List every named character that speaks dialogue in the story. Include multiple aliases if needed (e.g. "mother" AND "mom" if both appear).

Return ONLY a single JSON object with shape { "story": { ... Story fields ... }, "voiceMap": { narrator, characters } }. No commentary outside the JSON. No markdown code fences.`;
}

// ── Generation ──────────────────────────────────────────────────────
async function generateStory(def) {
  const systemPrompt = WRITING_RULES + "\n\n" + SAMPLE_STORY;
  const userPrompt = buildUserPrompt(def);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock) throw new Error("No text block in response");
  const raw = textBlock.text.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");

  // Claude occasionally emits unescaped double quotes inside JSON string
  // values (e.g. dialogue attributions). Try strict JSON first; fall back
  // to JS Function eval which tolerates the common failure modes.
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    try {
      parsed = new Function("return " + raw)();
    } catch {
      throw e;
    }
  }

  if (!parsed.story || !parsed.voiceMap) {
    throw new Error("Response missing story or voiceMap");
  }
  const s = parsed.story;
  if (!Array.isArray(s.pages) || s.pages.length !== PAGE_COUNT) {
    throw new Error(`Expected ${PAGE_COUNT} pages, got ${s.pages?.length}`);
  }
  if (!Array.isArray(s.fullPages) || s.fullPages.length !== PAGE_COUNT) {
    throw new Error(`Expected ${PAGE_COUNT} fullPages, got ${s.fullPages?.length}`);
  }
  if (AGE === "7-10") {
    const chapterStarts = s.fullPages.filter((p) => p.chapterTitle && p.chapterTitle.trim()).length;
    if (chapterStarts < CHAPTER_MIN || chapterStarts > CHAPTER_MAX) {
      throw new Error(`Expected ${CHAPTER_MIN}-${CHAPTER_MAX} chapter titles, got ${chapterStarts}`);
    }
  }
  return { story: s, voiceMap: parsed.voiceMap };
}

// ── Main ────────────────────────────────────────────────────────────
const existing = loadExistingStories();
const existingIds = new Set(existing.map((s) => s.id));
const voiceMap = loadVoiceMap();

console.log(`\n📚 Classic stories generator`);
console.log(`   Age: ${AGE}, page count: ${PAGE_COUNT}${CHAPTER_MAX ? `, chapters: ${CHAPTER_MIN}-${CHAPTER_MAX}` : ""}`);
console.log(`   Model: ${MODEL}`);
console.log(`   Generating: ${storiesToGenerate.length} stor${storiesToGenerate.length === 1 ? "y" : "ies"}${FORCE ? " (force-overwrite)" : ""}`);
console.log(`   Existing in ${TS_FILE.split(/[\\/]/).pop()}: ${existing.length}`);
console.log("");

let completed = 0, skipped = 0, failed = 0;
const merged = [...existing];

for (const def of storiesToGenerate) {
  if (!FORCE && existingIds.has(def.id)) {
    console.log(`[SKIP] ${def.title} — already exists (use --force to regenerate)`);
    skipped++;
    continue;
  }

  process.stdout.write(`[${completed + skipped + failed + 1}/${storiesToGenerate.length}] ${def.title}... `);
  try {
    const { story, voiceMap: vm } = await generateStory(def);

    // Remove any prior version and append the new one
    const idx = merged.findIndex((s) => s.id === story.id);
    if (idx >= 0) merged[idx] = story;
    else merged.push(story);

    voiceMap[story.id] = vm;

    // Persist incrementally (resumability)
    writeTsFile(merged);
    writeVoiceMap(voiceMap);

    completed++;
    console.log(`✓ ${story.pages.length} pages`);
  } catch (err) {
    console.log(`✗ ${err.message}`);
    failed++;
  }

  await new Promise((r) => setTimeout(r, 1000));
}

console.log("");
console.log(`Done — completed: ${completed}, skipped: ${skipped}, failed: ${failed}`);
console.log(`Output: ${TS_FILE}`);
console.log(`Voice map: ${VOICE_MAP_FILE}`);
