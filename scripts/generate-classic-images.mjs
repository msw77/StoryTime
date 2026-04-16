/**
 * Generate illustrations for classic stories using their scene descriptions.
 * Run with: node scripts/generate-classic-images.mjs
 *
 * Reads classic stories from src/data/classicStories2to4.ts (exported to JSON).
 * Uses the same Imagen 4 pipeline as the main app (fal.ts).
 * Saves image URLs into src/data/storyImages.json alongside existing entries.
 * Resumable — skips stories that already have the correct page count.
 */

import { fal } from "@fal-ai/client";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load env ────────────────────────────────────────────────────────
const envPath = join(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const falKey = envContent.match(/FAL_KEY=(.+)/)?.[1]?.trim();
if (!falKey) {
  console.error("FAL_KEY not found in .env.local");
  process.exit(1);
}
fal.config({ credentials: falKey });

// ── Style directives (mirrors src/lib/fal.ts exactly) ───────────────
const STYLE_PREFIX = `Warm, friendly children's book illustration in soft watercolor style. Simple shapes, rounded edges, warm natural lighting. Gentle color palette with soft blues, greens, and warm yellows. No scary or dark elements. Characters have large, expressive eyes and friendly expressions. Style is consistent with a modern children's picture book for ages 2-8.`;

const TEXTLESS_SUFFIX = `STYLE: Wordless painted illustration. Purely visual storytelling through expressions, body language, color, and lighting. Every surface is smooth, clean, and unadorned. Walls are bare. All surfaces show only color, pattern, or texture — never anything readable. Silent scene. The entire image is a single cohesive painting with nothing overlaid.`;

// Text sanitizer (mirrors src/lib/fal.ts)
function sanitize(text) {
  return text
    .replace(/["'"'\u201C\u201D\u2018\u2019][^"'"'\u201C\u201D\u2018\u2019]*["'"'\u201C\u201D\u2018\u2019]/g, "")
    .replace(/\b(saying|reading|that says|that reads|titled|labeled|written|writes|inscription)\b[^.,;]*/gi, "")
    .replace(/\b(the words?|the letters?|the name)\b[^.,;]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Parse classic stories from the TypeScript source ────────────────
// We can't import .ts directly in plain Node, so we do a quick regex
// extraction of the JSON-like data from the TS file.
function loadClassicStories(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  // Strip the TS wrapper: everything between the first [ and the last ]
  const match = raw.match(/export const \w+:\s*Story\[\]\s*=\s*(\[[\s\S]*\]);/);
  if (!match) throw new Error("Could not parse classic stories from " + filePath);
  // The data is already valid JSON (quoted keys, no trailing commas we hope)
  // Try JSON.parse; if it fails we'll eval in a safe-ish way
  try {
    return JSON.parse(match[1]);
  } catch {
    // Fallback: use Function constructor (no require/import access)
    // eslint-disable-next-line no-new-func
    return new Function("return " + match[1])();
  }
}

const CLASSIC_FILES = [
  join(__dirname, "..", "src", "data", "classicStories2to4.ts"),
  // Add more age groups here as they're created:
  // join(__dirname, "..", "src", "data", "classicStories4to7.ts"),
  // join(__dirname, "..", "src", "data", "classicStories7to10.ts"),
];

// Gather all classic stories
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

// ── Load existing image map ─────────────────────────────────────────
const OUTPUT_FILE = join(__dirname, "..", "src", "data", "storyImages.json");
let imageMap = {};
if (existsSync(OUTPUT_FILE)) {
  imageMap = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
  console.log(`Loaded existing image map: ${Object.keys(imageMap).length} stories`);
}

// ── Generate ────────────────────────────────────────────────────────
const totalPages = allStories.reduce((sum, s) => sum + (s.fullPages?.length || 0), 0);
console.log(`\n${allStories.length} classic stories, ${totalPages} total pages`);
console.log(`Estimated cost: ~$${(totalPages * 0.04).toFixed(2)} (Imagen 4 Fast)`);
console.log("");

async function generateImage(scene, mood) {
  const prompt = `${STYLE_PREFIX}\n\nScene: ${sanitize(scene)}\nMood: ${mood}\n\n${TEXTLESS_SUFFIX}`;

  const result = await fal.subscribe("fal-ai/imagen4/preview/fast", {
    input: {
      prompt,
      aspect_ratio: "16:9",
      num_images: 1,
      output_format: "png",
    },
  });

  const data = result.data;
  if (!data.images || data.images.length === 0) {
    throw new Error("No image returned");
  }
  return data.images[0].url;
}

let completed = 0;
let skipped = 0;
let failedPages = 0;

for (const story of allStories) {
  const pages = story.fullPages || [];
  if (pages.length === 0) {
    console.log(`[SKIP] ${story.title} — no fullPages`);
    skipped++;
    continue;
  }

  // Skip if already done with correct page count
  if (imageMap[story.id] && imageMap[story.id].length === pages.length) {
    console.log(`[SKIP] ${story.title} — already has ${pages.length} images`);
    skipped++;
    continue;
  }

  console.log(`\n[${completed + skipped + 1}/${allStories.length}] ${story.title} (${pages.length} pages)...`);

  const pageImages = imageMap[story.id] || [];

  for (let i = 0; i < pages.length; i++) {
    // Skip pages that already have an image
    if (pageImages[i]) {
      process.stdout.write(`  Page ${i + 1}/${pages.length} — already done\n`);
      continue;
    }

    const page = pages[i];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const url = await generateImage(page.scene, page.mood || "warm");
        pageImages[i] = url;
        process.stdout.write(`  Page ${i + 1}/${pages.length} ✓\n`);
        break;
      } catch (err) {
        if (attempt === 3) {
          console.error(`  Page ${i + 1}/${pages.length} FAILED after 3 attempts: ${err.message}`);
          pageImages[i] = null;
          failedPages++;
        } else {
          const wait = err.status === 429 ? 30000 : 5000 * attempt;
          console.log(`  Page ${i + 1} attempt ${attempt} failed, retrying in ${wait / 1000}s...`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }

    // Small delay between pages
    await new Promise((r) => setTimeout(r, 500));
  }

  imageMap[story.id] = pageImages;
  completed++;

  // Save progress after each story
  writeFileSync(OUTPUT_FILE, JSON.stringify(imageMap, null, 2));
  console.log(`  ✓ Saved. (${completed} done, ${skipped} skipped, ${failedPages} page failures)`);

  // Pause between stories
  await new Promise((r) => setTimeout(r, 1000));
}

console.log("\n═══════════════════════════════════════");
console.log(`Done! Stories processed: ${completed}`);
console.log(`Stories skipped: ${skipped}`);
console.log(`Page failures: ${failedPages}`);
console.log(`Output: ${OUTPUT_FILE}`);
