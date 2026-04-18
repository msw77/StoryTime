/**
 * Generate illustrations for all built-in stories using scene descriptions.
 * Run with: node scripts/generate-builtin-images.mjs
 *
 * Reads from generatedStories.json (which has scene descriptions per page).
 * Saves image URLs to src/data/storyImages.json.
 * Resumes from where it left off if interrupted.
 */

import { fal } from "@fal-ai/client";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logApiUsage } from "./lib/cost-log.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
const envPath = join(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const falKey = envContent.match(/FAL_KEY=(.+)/)?.[1]?.trim();
if (!falKey) {
  console.error("FAL_KEY not found in .env.local");
  process.exit(1);
}

fal.config({ credentials: falKey });

const anthropicKey = envContent.match(/STORYTIME_ANTHROPIC_KEY=(.+)/)?.[1]?.trim();
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

// Generate a consistent character description for a story
async function getCharacterDescription(story) {
  if (!anthropic) {
    // Fallback if no API key: use hero info directly
    return `${story.hero}, a ${story.heroType}`;
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `You are helping an illustrator draw children's book characters consistently across pages. Based on the story details below, write brief visual descriptions of ALL characters who appear in the story (2-3 sentences each). For each character include: species/type, approximate age, hair color/style, skin tone, clothing, and any distinguishing features. Be specific so each character looks the same in every illustration.

IMPORTANT: Do NOT interpret character names literally (e.g., "Teddy" is a human child, NOT a teddy bear, unless heroType explicitly says bear). If heroType says "girl" or "boy", the character is a human child.

Story: "${story.title}"
Hero name: ${story.hero}
Hero type: ${story.heroType}
Genre: ${story.genre}
Age group: ${story.age}
Scene descriptions: ${story.pages.map(p => p.scene).join(" | ")}

Reply with ONLY the character descriptions, nothing else. Format: "CharacterName: description" for each character, one per line.`
    }],
  });

  // Fire-and-forget cost log for character-description call.
  logApiUsage({
    provider: "anthropic",
    operation: "character-description",
    model: "claude-sonnet-4-20250514",
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    category: "builtin-generation",
    metadata: { storyId: story.id, title: story.title },
  });

  const text = response.content.find(c => c.type === "text");
  return text?.text?.trim() || `${story.hero}, a ${story.heroType}`;
}

const STYLE_PREFIX = `Warm, friendly children's book illustration in soft watercolor style. Simple shapes, rounded edges, warm natural lighting. Gentle color palette with soft blues, greens, and warm yellows. No text in the image. No scary or dark elements. Characters have large, expressive eyes and friendly expressions. Style is consistent with a modern children's picture book for ages 2-8.`;

// Input: generated stories with scene descriptions
const STORIES_FILE = join(__dirname, "..", "src", "data", "generatedStories.json");
const OUTPUT_FILE = join(__dirname, "..", "src", "data", "storyImages.json");

const storiesData = JSON.parse(readFileSync(STORIES_FILE, "utf-8"));
const storyIds = Object.keys(storiesData);

// Load existing progress
let imageMap = {};
if (existsSync(OUTPUT_FILE)) {
  imageMap = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
  console.log(`Loaded existing progress: ${Object.keys(imageMap).length} stories already done`);
}

const totalPages = storyIds.reduce((sum, id) => sum + storiesData[id].pages.length, 0);
console.log(`Found ${storyIds.length} stories, ${totalPages} total pages`);
console.log(`Estimated cost: $${(totalPages * 0.06).toFixed(2)}`);
console.log("");

async function generateImage(scene, mood, genre, title, characterDesc) {
  const prompt = `${STYLE_PREFIX}\n\nIMPORTANT - Characters (must look EXACTLY the same on every page):\n${characterDesc}\n\nScene from a ${genre} children's story called "${title}":\n${scene}\nMood: ${mood}`;

  const result = await fal.subscribe("fal-ai/nano-banana-2", {
    input: {
      prompt,
      aspect_ratio: "4:3",
      num_images: 1,
      output_format: "png",
      safety_tolerance: 1,
      resolution: "1K",
    },
  });

  const data = result.data;
  if (!data.images || data.images.length === 0) {
    throw new Error("No image returned");
  }

  // Fire-and-forget cost log for this fal image call.
  logApiUsage({
    provider: "fal",
    operation: "image-generation",
    model: "fal-ai/nano-banana-2",
    imagesGenerated: data.images.length,
    category: "builtin-generation",
    metadata: { title, genre, mood },
  });

  return data.images[0].url;
}

let completed = 0;
let skipped = 0;
let failedPages = 0;

for (const id of storyIds) {
  const story = storiesData[id];

  // Skip if already done with correct page count
  if (imageMap[id] && imageMap[id].length === story.pages.length) {
    skipped++;
    continue;
  }

  console.log(`[${completed + skipped + 1}/${storyIds.length}] ${story.title} (${story.pages.length} pages)...`);

  // Generate a consistent character description for this story
  let charDesc;
  try {
    charDesc = await getCharacterDescription(story);
    console.log(`  Character: ${charDesc.substring(0, 80)}...`);
  } catch (err) {
    charDesc = `${story.hero}, a ${story.heroType}`;
    console.log(`  Character fallback: ${charDesc}`);
  }

  const pageImages = [];
  for (let i = 0; i < story.pages.length; i++) {
    const page = story.pages[i];
    try {
      const url = await generateImage(
        page.scene || page.text,
        page.mood || "warm",
        story.genre,
        story.title,
        charDesc
      );
      pageImages.push(url);
      process.stdout.write(`  Page ${i + 1}/${story.pages.length} ✓\n`);
    } catch (err) {
      console.error(`  Page ${i + 1}/${story.pages.length} FAILED: ${err.message}`);
      pageImages.push(null);
      failedPages++;
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  imageMap[id] = pageImages;
  completed++;

  // Save progress after each story
  writeFileSync(OUTPUT_FILE, JSON.stringify(imageMap, null, 2));
  console.log(`  Saved. (${completed} done, ${skipped} skipped, ${failedPages} page failures)`);
}

console.log("\nDone!");
console.log(`Stories processed: ${completed}`);
console.log(`Stories skipped: ${skipped}`);
console.log(`Page failures: ${failedPages}`);
console.log(`Output: ${OUTPUT_FILE}`);
