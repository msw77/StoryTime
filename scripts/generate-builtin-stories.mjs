/**
 * Regenerate all 80 built-in stories using Claude API.
 * Run with: node scripts/generate-builtin-stories.mjs
 *
 * Generates 80 stories: 8 genres × ~10 stories each, spread across 3 age groups.
 * Each story gets 8-14 pages with scene descriptions for illustrations.
 *
 * Output: src/data/generatedStories.json (then manually replace stories.ts)
 */

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
const apiKey = envContent.match(/STORYTIME_ANTHROPIC_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) {
  console.error("STORYTIME_ANTHROPIC_KEY not found in .env.local");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

const OUTPUT_FILE = join(__dirname, "..", "src", "data", "generatedStories.json");

// Load existing progress
let storyMap = {};
if (existsSync(OUTPUT_FILE)) {
  storyMap = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
  console.log(`Loaded existing progress: ${Object.keys(storyMap).length} stories already done`);
}

// Story definitions: 80 stories, 10 per genre, spread across age groups
// Each genre: 3 stories for 2-4, 4 stories for 4-7, 3 stories for 7-10
const STORY_DEFS = [
  // ── Adventure ──
  { id: "a1", title: "The Lost Map", emoji: "🗺️", genre: "adventure", age: "4-7", hero: "Mia", heroType: "girl", obstacle: "finding a hidden treasure in the Whispering Woods", lesson: "Be brave" },
  { id: "a2", title: "Captain Finn's Treasure", emoji: "⚓", genre: "adventure", age: "4-7", hero: "Finn", heroType: "boy", obstacle: "his treasure chest has gone missing from his boat", lesson: "Be a good friend" },
  { id: "a3", title: "The Mountain of Echoes", emoji: "🏔️", genre: "adventure", age: "7-10", hero: "Leo", heroType: "boy", obstacle: "climbing a mountain nobody has climbed in a hundred years", lesson: "Believe in yourself" },
  { id: "a4", title: "Rosie's Rocket Wagon", emoji: "🚀", genre: "adventure", age: "2-4", hero: "Rosie", heroType: "girl", obstacle: "her wagon rocket goes on an unexpected journey down a hill", lesson: "Try new things" },
  { id: "a5", title: "The Door in the Floor", emoji: "🚪", genre: "adventure", age: "7-10", hero: "Kai", heroType: "boy", obstacle: "discovering a mysterious underground world beneath his new house", lesson: "Be brave" },
  { id: "a6", title: "Jungle Express", emoji: "🌴", genre: "adventure", age: "4-7", hero: "Ava", heroType: "girl", obstacle: "driving an old jungle train full of wild animal passengers", lesson: "Be kind" },
  { id: "a7", title: "Sky Pirates", emoji: "🏴‍☠️", genre: "adventure", age: "7-10", hero: "Storm", heroType: "girl", obstacle: "a rival crew trying to steal their rainbow colors", lesson: "Work together" },
  { id: "a8", title: "Tiny Explorer", emoji: "🐜", genre: "adventure", age: "2-4", hero: "Pip", heroType: "ant", obstacle: "climbing to the top of the kitchen table for the first time", lesson: "Never give up" },
  { id: "a9", title: "The Brave Little Boat", emoji: "⛵", genre: "adventure", age: "2-4", hero: "the paper boat", heroType: "paper boat", obstacle: "floating down a stream through unknown waters", lesson: "Be brave" },
  { id: "a10", title: "Desert Star", emoji: "🌵", genre: "adventure", age: "4-7", hero: "Yara", heroType: "girl", obstacle: "following a mysterious star through the hot desert", lesson: "Never give up" },

  // ── Fantasy ──
  { id: "f1", title: "The Wishing Pebble", emoji: "✨", genre: "fantasy", age: "2-4", hero: "Lila", heroType: "girl", obstacle: "figuring out what to wish for with a magical pebble", lesson: "Be kind" },
  { id: "f2", title: "The Cloud Castle", emoji: "☁️", genre: "fantasy", age: "4-7", hero: "Princess Wren", heroType: "girl", obstacle: "her cloud castle is drifting out to sea in a strong wind", lesson: "Be brave" },
  { id: "f3", title: "Ember the Tiny Dragon", emoji: "🐉", genre: "fantasy", age: "4-7", hero: "Ember", heroType: "dragon", obstacle: "being too small with too-gentle fire while bigger dragons laugh", lesson: "Believe in yourself" },
  { id: "f4", title: "The Moonlight Garden", emoji: "🌙", genre: "fantasy", age: "7-10", hero: "Noor", heroType: "girl", obstacle: "discovering a secret magical garden that only blooms at midnight", lesson: "Try new things" },
  { id: "f5", title: "The Painted Kingdom", emoji: "🎨", genre: "fantasy", age: "7-10", hero: "Sage", heroType: "girl", obstacle: "the paint-people in a magical painting are fading away", lesson: "Be kind" },
  { id: "f6", title: "Zara and the Rainbow Dragon", emoji: "🌈", genre: "fantasy", age: "4-7", hero: "Zara", heroType: "girl", obstacle: "helping a shy rainbow dragon who has lost confidence", lesson: "Be a good friend" },
  { id: "f7", title: "The Invisible Friend", emoji: "👻", genre: "fantasy", age: "2-4", hero: "Sam", heroType: "boy", obstacle: "having a friend nobody else can see", lesson: "Be a good friend" },
  { id: "f8", title: "The Star Collector", emoji: "⭐", genre: "fantasy", age: "4-7", hero: "Lily", heroType: "girl", obstacle: "a fallen star that's too dim to hang back in the sky", lesson: "Share with others" },
  { id: "f9", title: "The Spell That Sneezed", emoji: "🤧", genre: "fantasy", age: "4-7", hero: "Wizard Fern", heroType: "girl", obstacle: "a cleaning spell goes haywire and turns everything to bubbles", lesson: "Never give up" },
  { id: "f10", title: "The Giant's Garden", emoji: "🌻", genre: "fantasy", age: "7-10", hero: "Mara", heroType: "girl", obstacle: "a hungry village is too afraid to ask the lonely giant for help", lesson: "Be brave" },

  // ── Friendship ──
  { id: "fr1", title: "Two Cups of Cocoa", emoji: "☕", genre: "friendship", age: "2-4", hero: "Bear", heroType: "bear", obstacle: "Fox is cold and sad after being out in the snow all day", lesson: "Be kind" },
  { id: "fr2", title: "The Sharing Tree", emoji: "🌳", genre: "friendship", age: "4-7", hero: "Maya", heroType: "girl", obstacle: "a magical tree that only gives apples when you share them", lesson: "Share with others" },
  { id: "fr3", title: "The Quiet Friend", emoji: "🤫", genre: "friendship", age: "7-10", hero: "Eli", heroType: "boy", obstacle: "nobody at school talks to him because he's too quiet", lesson: "Be a good friend" },
  { id: "fr4", title: "Puddle Pals", emoji: "💦", genre: "friendship", age: "2-4", hero: "Duck", heroType: "duck", obstacle: "Duck and Pig both want the same puddle to splash in", lesson: "Share with others" },
  { id: "fr5", title: "The New Kid", emoji: "🏫", genre: "friendship", age: "4-7", hero: "Amara", heroType: "girl", obstacle: "being new at school where everyone already has friends", lesson: "Be brave" },
  { id: "fr6", title: "The Blanket Fort", emoji: "🏰", genre: "friendship", age: "2-4", hero: "Milo", heroType: "boy", obstacle: "his sister wants to come into his blanket fort but he wants it all to himself", lesson: "Share with others" },
  { id: "fr7", title: "The Bridge Builders", emoji: "🌉", genre: "friendship", age: "7-10", hero: "Ravi", heroType: "boy", obstacle: "two groups of kids on opposite sides of a creek who won't cooperate", lesson: "Work together" },
  { id: "fr8", title: "The Wrong Gift", emoji: "🎁", genre: "friendship", age: "4-7", hero: "Theo", heroType: "boy", obstacle: "he made a gift for his friend but it turned out all wrong", lesson: "Be honest" },
  { id: "fr9", title: "Side by Side", emoji: "🚲", genre: "friendship", age: "4-7", hero: "Nina", heroType: "girl", obstacle: "her best friend is moving away at the end of summer", lesson: "Be a good friend" },
  { id: "fr10", title: "The Argument", emoji: "⚡", genre: "friendship", age: "7-10", hero: "Zack", heroType: "boy", obstacle: "he and his best friend had a big fight and aren't speaking", lesson: "Be honest" },

  // ── Silly ──
  { id: "s1", title: "The Backwards Day", emoji: "🔄", genre: "silly", age: "4-7", hero: "Jax", heroType: "boy", obstacle: "everything is happening backwards and nobody knows why", lesson: "Try new things" },
  { id: "s2", title: "The Hiccup Cure", emoji: "😵", genre: "silly", age: "2-4", hero: "Bunny", heroType: "bunny", obstacle: "Bunny has hiccups that won't stop and each hiccup does something funny", lesson: "Be a good friend" },
  { id: "s3", title: "Spaghetti Hair", emoji: "🍝", genre: "silly", age: "4-7", hero: "Olive", heroType: "girl", obstacle: "she wished her hair was more interesting and now it's made of spaghetti", lesson: "Believe in yourself" },
  { id: "s4", title: "The Talking Shoe", emoji: "👟", genre: "silly", age: "4-7", hero: "Max", heroType: "boy", obstacle: "his left shoe starts talking and won't stop giving bad advice", lesson: "Be honest" },
  { id: "s5", title: "Super Slow Sloth", emoji: "🦥", genre: "silly", age: "2-4", hero: "Stanley", heroType: "sloth", obstacle: "he's trying to win a race but he's incredibly slow", lesson: "Never give up" },
  { id: "s6", title: "The Upside Down House", emoji: "🙃", genre: "silly", age: "7-10", hero: "Kira", heroType: "girl", obstacle: "her whole house flipped upside down overnight", lesson: "Try new things" },
  { id: "s7", title: "Grandpa's Magic Mustache", emoji: "🥸", genre: "silly", age: "4-7", hero: "Grandpa Lou", heroType: "grandpa", obstacle: "his mustache has a mind of its own and keeps doing silly things", lesson: "Be kind" },
  { id: "s8", title: "The Tickle Monster", emoji: "🤣", genre: "silly", age: "2-4", hero: "Giggles", heroType: "monster", obstacle: "a friendly monster who accidentally tickles everyone he touches", lesson: "Be a good friend" },
  { id: "s9", title: "Dinosaur at School", emoji: "🦕", genre: "silly", age: "7-10", hero: "a dinosaur named Doug", heroType: "dinosaur", obstacle: "a dinosaur shows up at school and tries to be a regular student", lesson: "Try new things" },
  { id: "s10", title: "The Burping Princess", emoji: "👑", genre: "silly", age: "7-10", hero: "Princess Petunia", heroType: "girl", obstacle: "she can't stop burping at the royal banquet", lesson: "Believe in yourself" },

  // ── Mystery ──
  { id: "m1", title: "The Missing Cookies", emoji: "🍪", genre: "mystery", age: "2-4", hero: "Bear", heroType: "bear", obstacle: "someone ate all the cookies and left crumbs everywhere", lesson: "Be honest" },
  { id: "m2", title: "The Phantom Footprints", emoji: "👣", genre: "mystery", age: "4-7", hero: "Devi", heroType: "girl", obstacle: "mysterious footprints appear in the garden every morning", lesson: "Be brave" },
  { id: "m3", title: "The Whispering Walls", emoji: "🏚️", genre: "mystery", age: "7-10", hero: "Cassie", heroType: "girl", obstacle: "the walls of the old library seem to be whispering clues", lesson: "Never give up" },
  { id: "m4", title: "Who Took the Moon?", emoji: "🌑", genre: "mystery", age: "2-4", hero: "Owl", heroType: "owl", obstacle: "the moon has disappeared from the sky", lesson: "Work together" },
  { id: "m5", title: "The Secret Note", emoji: "📝", genre: "mystery", age: "4-7", hero: "Marco", heroType: "boy", obstacle: "a mysterious note in his locker leads to a treasure hunt", lesson: "Be brave" },
  { id: "m6", title: "The Vanishing Colors", emoji: "🎨", genre: "mystery", age: "4-7", hero: "Priya", heroType: "girl", obstacle: "all the colors are disappearing from the town one by one", lesson: "Work together" },
  { id: "m7", title: "The Clock That Stopped", emoji: "🕐", genre: "mystery", age: "7-10", hero: "Felix", heroType: "boy", obstacle: "the town clock stopped and strange things started happening", lesson: "Never give up" },
  { id: "m8", title: "The Giggling Attic", emoji: "🏠", genre: "mystery", age: "4-7", hero: "Suki", heroType: "girl", obstacle: "giggles come from the attic every night but nothing is up there", lesson: "Be brave" },
  { id: "m9", title: "Paws and Clues", emoji: "🐾", genre: "mystery", age: "7-10", hero: "Jake", heroType: "boy", obstacle: "his dog keeps digging up strange old objects in the yard", lesson: "Never give up" },
  { id: "m10", title: "The Mixed-Up Mail", emoji: "📮", genre: "mystery", age: "2-4", hero: "Possum", heroType: "possum", obstacle: "all the mail in the forest got mixed up and nobody got the right letter", lesson: "Be kind" },

  // ── Science ──
  { id: "sc1", title: "The Seed That Grew Overnight", emoji: "🌱", genre: "science", age: "2-4", hero: "Daisy", heroType: "girl", obstacle: "she planted a seed and it grew into something enormous overnight", lesson: "Respect nature" },
  { id: "sc2", title: "Robot Best Friend", emoji: "🤖", genre: "science", age: "4-7", hero: "Zain", heroType: "boy", obstacle: "the robot he built doesn't understand feelings", lesson: "Be a good friend" },
  { id: "sc3", title: "The Weather Machine", emoji: "🌦️", genre: "science", age: "7-10", hero: "Dr. Ellie", heroType: "girl", obstacle: "her weather machine makes it rain candy but causes unexpected problems", lesson: "Be honest" },
  { id: "sc4", title: "Moon Rock Surprise", emoji: "🌙", genre: "science", age: "4-7", hero: "Astrid", heroType: "girl", obstacle: "a glowing rock from the moon starts growing crystals", lesson: "Try new things" },
  { id: "sc5", title: "Tiny World", emoji: "🔬", genre: "science", age: "7-10", hero: "Ben", heroType: "boy", obstacle: "he shrinks down and discovers a whole world living in a drop of pond water", lesson: "Respect nature" },
  { id: "sc6", title: "The Color Experiment", emoji: "🧪", genre: "science", age: "2-4", hero: "Mimi", heroType: "girl", obstacle: "mixing colors in the kitchen makes surprising new ones", lesson: "Try new things" },
  { id: "sc7", title: "Gravity Day Off", emoji: "🎈", genre: "science", age: "4-7", hero: "Tomas", heroType: "boy", obstacle: "gravity stops working for a day and everything floats", lesson: "Work together" },
  { id: "sc8", title: "The Dinosaur Egg", emoji: "🥚", genre: "science", age: "4-7", hero: "Layla", heroType: "girl", obstacle: "she found what looks like a real dinosaur egg at the dig site", lesson: "Respect nature" },
  { id: "sc9", title: "Stargazer", emoji: "🔭", genre: "science", age: "7-10", hero: "Nia", heroType: "girl", obstacle: "she sees a new star that nobody else has ever noticed", lesson: "Believe in yourself" },
  { id: "sc10", title: "Bubble Planet", emoji: "🫧", genre: "science", age: "2-4", hero: "Gus", heroType: "boy", obstacle: "he blows a bubble so big he can ride inside it", lesson: "Try new things" },

  // ── Animals ──
  { id: "an1", title: "The Lost Penguin", emoji: "🐧", genre: "animals", age: "2-4", hero: "Waddles", heroType: "penguin", obstacle: "he wandered away from his colony and can't find his way back", lesson: "Be brave" },
  { id: "an2", title: "Honey Bee's Big Day", emoji: "🐝", genre: "animals", age: "4-7", hero: "Bella", heroType: "bee", obstacle: "it's her first day collecting nectar and she keeps getting lost", lesson: "Never give up" },
  { id: "an3", title: "The Grumpy Hedgehog", emoji: "🦔", genre: "animals", age: "4-7", hero: "Harold", heroType: "hedgehog", obstacle: "he's too prickly for anyone to hug and it makes him grumpy", lesson: "Be a good friend" },
  { id: "an4", title: "Ocean Twins", emoji: "🐬", genre: "animals", age: "7-10", hero: "Coral and Pearl", heroType: "dolphins", obstacle: "twin dolphins who get separated during a big ocean current", lesson: "Work together" },
  { id: "an5", title: "The Sleepy Koala", emoji: "🐨", genre: "animals", age: "2-4", hero: "Koko", heroType: "koala", obstacle: "Koko is too sleepy to come down from the tree but all the fun is on the ground", lesson: "Try new things" },
  { id: "an6", title: "Firefly Night", emoji: "✨", genre: "animals", age: "4-7", hero: "Flicker", heroType: "firefly", obstacle: "his light is dimmer than all the other fireflies", lesson: "Believe in yourself" },
  { id: "an7", title: "The Fox and the Garden", emoji: "🦊", genre: "animals", age: "7-10", hero: "Fern the fox", heroType: "fox", obstacle: "she discovers a garden but the rabbits who live there don't trust foxes", lesson: "Be honest" },
  { id: "an8", title: "Little Bear's First Snow", emoji: "🐻", genre: "animals", age: "2-4", hero: "Little Bear", heroType: "bear cub", obstacle: "seeing snow for the very first time and not knowing what it is", lesson: "Try new things" },
  { id: "an9", title: "The Singing Whale", emoji: "🐋", genre: "animals", age: "4-7", hero: "Melody", heroType: "whale", obstacle: "her song is different from all the other whales and she feels alone", lesson: "Believe in yourself" },
  { id: "an10", title: "Migration Day", emoji: "🦅", genre: "animals", age: "7-10", hero: "Swift", heroType: "young eagle", obstacle: "it's time for her first migration south but she's afraid of the long journey", lesson: "Be brave" },

  // ── Sports ──
  { id: "sp1", title: "The Kickball Kid", emoji: "⚽", genre: "sports", age: "4-7", hero: "Carlos", heroType: "boy", obstacle: "he's the smallest kid on the team and nobody passes to him", lesson: "Believe in yourself" },
  { id: "sp2", title: "Swim Day", emoji: "🏊", genre: "sports", age: "2-4", hero: "Ruby", heroType: "girl", obstacle: "she's afraid to put her face in the water at swim class", lesson: "Be brave" },
  { id: "sp3", title: "The Big Race", emoji: "🏃", genre: "sports", age: "4-7", hero: "Jasper", heroType: "boy", obstacle: "he trips and falls during the school race", lesson: "Never give up" },
  { id: "sp4", title: "Skateboard Dreams", emoji: "🛹", genre: "sports", age: "7-10", hero: "Maya", heroType: "girl", obstacle: "she keeps falling trying to learn a new skateboard trick", lesson: "Never give up" },
  { id: "sp5", title: "Catch and Throw", emoji: "🥎", genre: "sports", age: "2-4", hero: "Benny", heroType: "boy", obstacle: "he can't catch the ball no matter how hard he tries", lesson: "Never give up" },
  { id: "sp6", title: "The Dance Contest", emoji: "💃", genre: "sports", age: "4-7", hero: "Luna", heroType: "girl", obstacle: "she freezes up on stage during the dance competition", lesson: "Believe in yourself" },
  { id: "sp7", title: "Mountain Bike Trail", emoji: "🚵", genre: "sports", age: "7-10", hero: "Tyler", heroType: "boy", obstacle: "the trail is harder than expected and his friends want to turn back", lesson: "Work together" },
  { id: "sp8", title: "The Gymnastics Star", emoji: "🤸", genre: "sports", age: "4-7", hero: "Aria", heroType: "girl", obstacle: "she can't do a cartwheel while all her friends can", lesson: "Never give up" },
  { id: "sp9", title: "Ice Skating Surprise", emoji: "⛸️", genre: "sports", age: "7-10", hero: "Aiden", heroType: "boy", obstacle: "he secretly wants to figure skate but thinks his friends will laugh", lesson: "Be brave" },
  { id: "sp10", title: "Teddy's First Game", emoji: "🏀", genre: "sports", age: "2-4", hero: "Teddy", heroType: "bear", obstacle: "it's his first basketball game and the ball is bigger than his head", lesson: "Try new things" },
];

function getAgeDescription(age) {
  if (age === "2-4") return "ages 2-4 (very simple words, 1-2 short sentences per page)";
  if (age === "4-7") return "ages 4-7 (richer vocabulary, 2-4 sentences per page)";
  return "ages 7-10 (complex narrative, 3-6 sentences per page)";
}

function getWordsPerPage(age) {
  if (age === "2-4") return "30-50";
  if (age === "4-7") return "50-80";
  return "80-120";
}

async function generateStory(def) {
  const ageDesc = getAgeDescription(def.age);
  const wordsPerPage = getWordsPerPage(def.age);

  const prompt = `You are a beloved children's story author. Write a read-along story.

Title: ${def.title}
Hero: ${def.hero} (a ${def.heroType})
Genre: ${def.genre}
Reading level: ${ageDesc}
Obstacle: ${def.obstacle}
Lesson: ${def.lesson}

TARGET: 10 pages average. Minimum 8 pages, maximum 14 pages.
Each page = one scene or moment (each page gets its own illustration).

IMPORTANT RULES:
- Each page should be ${wordsPerPage} words
- Age-appropriate vocabulary and sentence length
- Warm, gentle tone. Never scary. Always hopeful.
- Weave the lesson naturally — never preach
- Include sensory details (sounds, colors, textures, smells)
- The story needs a clear beginning, rising action, climax, and satisfying resolution
- For ages 2-4: very simple words, 1-2 short sentences per page
- For ages 4-7: richer vocabulary, 2-4 sentences per page
- For ages 7-10: complex narrative, 3-6 sentences per page

For each page, also provide an illustration prompt describing the visual scene.

Return valid JSON only, no other text:
{
  "title": "${def.title}",
  "emoji": "${def.emoji}",
  "pages": [
    {
      "label": "Page 1",
      "text": "story text for this page...",
      "scene": "illustration prompt: what should the picture show",
      "mood": "peaceful|exciting|funny|mysterious|warm|triumphant",
      "sounds": ["birds chirping", "wind rustling"]
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  // Fire-and-forget cost log for this Claude call.
  logApiUsage({
    provider: "anthropic",
    operation: "story-generation",
    model: "claude-sonnet-4-20250514",
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    category: "builtin-generation",
    metadata: { storyId: def.id, title: def.title, genre: def.genre, age: def.age },
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("No text response");

  const jsonText = textContent.text.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
  const story = JSON.parse(jsonText);

  if (!story.pages || story.pages.length < 8) {
    throw new Error(`Only ${story.pages?.length || 0} pages (need at least 8)`);
  }

  return story;
}

// Process stories
let completed = 0;
let skipped = 0;
let failed = 0;

console.log(`Processing ${STORY_DEFS.length} stories...`);
console.log("");

for (const def of STORY_DEFS) {
  if (storyMap[def.id]) {
    skipped++;
    continue;
  }

  process.stdout.write(`[${completed + skipped + 1}/${STORY_DEFS.length}] ${def.title} (${def.genre}, ${def.age})... `);

  try {
    const story = await generateStory(def);
    storyMap[def.id] = {
      ...def,
      pages: story.pages,
    };
    completed++;
    console.log(`✓ ${story.pages.length} pages`);

    // Save progress
    writeFileSync(OUTPUT_FILE, JSON.stringify(storyMap, null, 2));
  } catch (err) {
    console.log(`✗ ${err.message}`);
    failed++;
  }

  // Small delay to avoid rate limits
  await new Promise(r => setTimeout(r, 1000));
}

console.log("");
console.log("Done!");
console.log(`Completed: ${completed}`);
console.log(`Skipped (already done): ${skipped}`);
console.log(`Failed: ${failed}`);
console.log(`Output: ${OUTPUT_FILE}`);
