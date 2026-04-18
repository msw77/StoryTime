/**
 * Generate 10 history stories with factual accuracy requirements.
 * Run with: node scripts/generate-history-stories.mjs
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logApiUsage } from "./lib/cost-log.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const apiKey = envContent.match(/STORYTIME_ANTHROPIC_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) {
  console.error("STORYTIME_ANTHROPIC_KEY not found in .env.local");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

// Load existing generated stories so we can append
const STORIES_FILE = join(__dirname, "..", "src", "data", "generatedStories.json");
let storyMap = {};
if (existsSync(STORIES_FILE)) {
  storyMap = JSON.parse(readFileSync(STORIES_FILE, "utf-8"));
}

const HISTORY_STORIES = [
  // Ages 4-7
  {
    id: "h1",
    title: "The First Moon Landing",
    emoji: "🌙",
    genre: "history",
    age: "4-7",
    hero: "Neil Armstrong",
    heroType: "astronaut",
    topic: "The Apollo 11 mission in July 1969. Neil Armstrong, Buzz Aldrin, and Michael Collins flew to the moon. Armstrong was the first person to walk on the moon, saying 'That\\'s one small step for man, one giant leap for mankind.' Aldrin joined him while Collins orbited above.",
    keyFacts: "Launch date July 16 1969, landing July 20, Saturn V rocket, Sea of Tranquility landing site, planted American flag, collected moon rocks, splashdown in Pacific Ocean"
  },
  {
    id: "h2",
    title: "The Pyramids of Egypt",
    emoji: "🔺",
    genre: "history",
    age: "4-7",
    hero: "a young Egyptian child",
    heroType: "child",
    topic: "The Great Pyramids of Giza, built around 2560 BC as tombs for pharaohs. The Great Pyramid was built for Pharaoh Khufu. Thousands of workers moved massive limestone blocks. The pyramids were the tallest structures in the world for over 3,800 years.",
    keyFacts: "Built ~2560 BC, Giza plateau near Cairo, Great Pyramid for Pharaoh Khufu, 2.3 million limestone blocks, workers were skilled laborers (not slaves as commonly believed), originally covered in white limestone casing, the Sphinx guards nearby"
  },
  {
    id: "h3",
    title: "Amelia Earhart's Big Flight",
    emoji: "✈️",
    genre: "history",
    age: "4-7",
    hero: "Amelia Earhart",
    heroType: "pilot",
    topic: "Amelia Earhart, the first woman to fly solo across the Atlantic Ocean in 1932. She flew from Newfoundland to Northern Ireland in about 15 hours. She inspired millions of women and girls to pursue their dreams. She disappeared in 1937 while attempting to fly around the world.",
    keyFacts: "Born 1897 in Kansas, first woman solo transatlantic flight May 1932, flew a Lockheed Vega, landed in a field in Northern Ireland, also set altitude records, disappeared July 1937 over the Pacific during round-the-world attempt"
  },
  {
    id: "h4",
    title: "The Great Wall of China",
    emoji: "🧱",
    genre: "history",
    age: "4-7",
    hero: "a young Chinese child",
    heroType: "child",
    topic: "The Great Wall of China, built over many centuries to protect China from invasions. Construction began as early as the 7th century BC, with major work under Emperor Qin Shi Huang around 221 BC. The wall stretches over 13,000 miles across mountains, deserts, and plains.",
    keyFacts: "Over 13,000 miles long, built over 2000+ years, many dynasties contributed, Emperor Qin Shi Huang unified earlier walls around 221 BC, made of stone brick tamped earth and wood, watchtowers every few hundred meters, visible from hilltops but NOT from space contrary to myth, UNESCO World Heritage Site"
  },
  {
    id: "h5",
    title: "The Story of American Independence",
    emoji: "🔔",
    genre: "history",
    age: "4-7",
    hero: "a young colonial child",
    heroType: "child",
    topic: "American Independence from Britain. The 13 colonies were tired of unfair taxes and rules from King George III. The Boston Tea Party in 1773. Thomas Jefferson wrote the Declaration of Independence, adopted July 4, 1776. George Washington led the Continental Army.",
    keyFacts: "13 colonies, taxation without representation, Boston Tea Party December 1773, First Continental Congress 1774, Declaration of Independence written by Thomas Jefferson adopted July 4 1776, George Washington commander of Continental Army, Liberty Bell in Philadelphia, war ended 1783 with Treaty of Paris"
  },
  // Ages 7-10
  {
    id: "h6",
    title: "The Voyage of the Mayflower",
    emoji: "⛵",
    genre: "history",
    age: "7-10",
    hero: "a young Pilgrim child",
    heroType: "child",
    topic: "The Mayflower voyage in 1620. About 102 passengers (Pilgrims and others) sailed from Plymouth, England to the New World seeking religious freedom. The 66-day voyage was rough. They landed at Plymouth Rock in Massachusetts. The first winter was devastating, but the Wampanoag people helped them survive.",
    keyFacts: "Departed September 1620 from Plymouth England, 102 passengers, 66 days at sea, landed November 1620 at Plymouth Massachusetts, Mayflower Compact signed as self-governance agreement, brutal first winter killed about half the colonists, Squanto and the Wampanoag taught farming and fishing, first Thanksgiving harvest feast 1621"
  },
  {
    id: "h7",
    title: "Leonardo da Vinci's Workshop",
    emoji: "🎨",
    genre: "history",
    age: "7-10",
    hero: "Leonardo da Vinci",
    heroType: "artist and inventor",
    topic: "Leonardo da Vinci (1452-1519), the Italian Renaissance genius who was a painter, inventor, scientist, and engineer. He painted the Mona Lisa and The Last Supper. He designed flying machines, tanks, and bridges centuries before they existed. He filled notebooks with drawings and mirror writing.",
    keyFacts: "Born 1452 in Vinci Italy, painted Mona Lisa (now in the Louvre) and The Last Supper, designed helicopter-like flying machine and parachute, studied human anatomy through dissections, wrote backwards in mirror script, worked for the Duke of Milan and King of France, died 1519 in France, true Renaissance Man"
  },
  {
    id: "h8",
    title: "The Underground Railroad",
    emoji: "⭐",
    genre: "history",
    age: "7-10",
    hero: "Harriet Tubman",
    heroType: "freedom leader",
    topic: "Harriet Tubman and the Underground Railroad, a secret network of routes and safe houses used by enslaved African Americans to escape to freedom in the 1800s. Tubman escaped slavery herself in 1849, then returned south about 13 times to lead roughly 70 people to freedom. She was called Moses.",
    keyFacts: "Harriet Tubman born ~1822 in Maryland, escaped 1849, returned ~13 times, rescued ~70 people, never lost a passenger, used the North Star for navigation, safe houses called stations, conductors guided travelers, went to northern free states and Canada, Tubman also served as a Union spy during Civil War"
  },
  {
    id: "h9",
    title: "Pompeii: The City Frozen in Time",
    emoji: "🌋",
    genre: "history",
    age: "7-10",
    hero: "a young Roman child",
    heroType: "child",
    topic: "The eruption of Mount Vesuvius in 79 AD that buried the Roman city of Pompeii under volcanic ash. The city was a thriving Roman town of about 11,000 people. The eruption happened on August 24, preserving the city almost perfectly under ash. It was rediscovered in 1748.",
    keyFacts: "Pompeii near modern Naples Italy, population ~11000, eruption of Vesuvius August 24 79 AD, city buried under 13-20 feet of volcanic ash and pumice, also buried nearby Herculaneum, rediscovered 1748, preserved buildings frescoes mosaics and even food, plaster casts of victims, now a UNESCO World Heritage Site and major archaeological site"
  },
  {
    id: "h10",
    title: "The Wright Brothers at Kitty Hawk",
    emoji: "🛩️",
    genre: "history",
    age: "7-10",
    hero: "Wilbur and Orville Wright",
    heroType: "inventors and brothers",
    topic: "Wilbur and Orville Wright, two brothers from Dayton, Ohio who ran a bicycle shop and built the first successful powered airplane. On December 17, 1903, at Kitty Hawk, North Carolina, they made four flights. The first lasted 12 seconds and covered 120 feet. The longest was 59 seconds.",
    keyFacts: "Wilbur born 1867 Orville born 1871, owned a bicycle shop in Dayton Ohio, studied birds for wing design, built wind tunnel for testing, the Wright Flyer was their plane, first flight December 17 1903, Kitty Hawk North Carolina chosen for steady winds and soft sand, first flight 12 seconds 120 feet by Orville, four flights that day longest 59 seconds 852 feet by Wilbur"
  },
];

function getAgeDescription(age) {
  if (age === "4-7") return "ages 4-7 (richer vocabulary, 2-4 sentences per page)";
  return "ages 7-10 (complex narrative, 3-6 sentences per page)";
}

function getWordsPerPage(age) {
  if (age === "4-7") return "50-80";
  return "80-120";
}

async function generateStory(def) {
  const ageDesc = getAgeDescription(def.age);
  const wordsPerPage = getWordsPerPage(def.age);

  const prompt = `You are a beloved children's story author AND a historian. Write a read-along story that is HISTORICALLY ACCURATE.

Title: ${def.title}
Hero/Subject: ${def.hero} (${def.heroType})
Genre: history
Reading level: ${ageDesc}
Historical topic: ${def.topic}

KEY HISTORICAL FACTS THAT MUST BE INCLUDED AND ACCURATE:
${def.keyFacts}

TARGET: 10 pages average. Minimum 8 pages, maximum 14 pages.
Each page = one scene or moment (each page gets its own illustration).

IMPORTANT RULES:
- Each page should be ${wordsPerPage} words
- ALL historical facts, dates, names, and events MUST be accurate — do not invent or change historical details
- Age-appropriate vocabulary and sentence length
- Warm, engaging tone that makes history exciting for kids
- Present real people as real people — don't fictionalize their personalities beyond what's documented
- If the hero is a fictional child witnessing events, make the historical events around them accurate
- Include sensory details (sounds, colors, textures, smells) to bring the era to life
- The story needs a clear beginning, rising action, climax, and satisfying resolution

For each page, also provide an illustration prompt describing the visual scene.
IMPORTANT FOR ILLUSTRATIONS: Include historically accurate details in scene descriptions — correct clothing for the era, accurate architecture, accurate depictions of real people and landmarks. For public figures, describe their known appearance accurately.

Return valid JSON only, no other text:
{
  "title": "${def.title}",
  "emoji": "${def.emoji}",
  "pages": [
    {
      "label": "Page 1",
      "text": "story text for this page...",
      "scene": "illustration prompt with historically accurate visual details...",
      "mood": "peaceful|exciting|funny|mysterious|warm|triumphant",
      "sounds": ["relevant sounds"]
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  // Fire-and-forget cost log for this Claude call.
  // Pricing map uses base model key; haiku-4-5 pricing is the same across
  // dated snapshots so we normalize to "claude-haiku-4-5".
  logApiUsage({
    provider: "anthropic",
    operation: "story-generation",
    model: "claude-haiku-4-5",
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    category: "history-generation",
    metadata: { storyId: def.id, title: def.title, age: def.age },
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

console.log(`Generating ${HISTORY_STORIES.length} history stories...`);
console.log("");

let completed = 0;
let failed = 0;

for (const def of HISTORY_STORIES) {
  if (storyMap[def.id]) {
    console.log(`[${completed + 1}/${HISTORY_STORIES.length}] ${def.title} — already exists, skipping`);
    completed++;
    continue;
  }

  process.stdout.write(`[${completed + 1}/${HISTORY_STORIES.length}] ${def.title} (${def.age})... `);

  let success = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const story = await generateStory(def);
      storyMap[def.id] = {
        ...def,
        pages: story.pages,
      };
      completed++;
      console.log(`✓ ${story.pages.length} pages`);
      writeFileSync(STORIES_FILE, JSON.stringify(storyMap, null, 2));
      success = true;
      break;
    } catch (err) {
      console.log(`✗ attempt ${attempt}/5: ${err.message}`);
      if (attempt < 5) {
        const wait = attempt * 15;
        console.log(`  Waiting ${wait}s before retry...`);
        await new Promise(r => setTimeout(r, wait * 1000));
      }
    }
  }
  if (!success) failed++;

  await new Promise(r => setTimeout(r, 5000));
}

console.log("");
console.log(`Done! Completed: ${completed}, Failed: ${failed}`);
console.log(`Total stories in library: ${Object.keys(storyMap).length}`);
