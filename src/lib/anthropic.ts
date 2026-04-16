import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const apiKey = process.env.STORYTIME_ANTHROPIC_KEY;
  if (!apiKey) {
    throw new Error("STORYTIME_ANTHROPIC_KEY environment variable is not set");
  }
  return new Anthropic({ apiKey });
}

interface StoryRequest {
  heroName: string;
  heroType: string;
  genre: string;
  age: string;
  obstacle: string;
  lesson: string;
  extras: string;
  duration: string;
}

interface GeneratedPage {
  label: string;
  text: string;
  scene: string;
  mood: string;
  sounds: string[];
  /** Set on the first page of each chapter for Medium/Long stories;
   *  omitted/null on every other page. */
  chapterTitle?: string | null;
}

interface GeneratedStory {
  title: string;
  emoji: string;
  characterDescription: string;
  pages: GeneratedPage[];
}

// Map duration to target words and words-per-page based on age
function getStoryParams(duration: string, age: string) {
  const durationMap: Record<string, number> = {
    "3": 400, "5": 650, "10": 1300, "15": 1950, "20": 2600,
  };
  const targetWords = durationMap[duration] || 650;

  let wordsPerPage: string;
  let ageDescription: string;
  if (age === "2-4") {
    wordsPerPage = "30-50";
    ageDescription = "ages 2-4 (very simple words, 1-2 short sentences per page)";
  } else if (age === "4-7") {
    wordsPerPage = "50-80";
    ageDescription = "ages 4-7 (richer vocabulary, 2-4 sentences per page)";
  } else {
    wordsPerPage = "80-120";
    ageDescription = "ages 7-10 (complex narrative, 3-6 sentences per page)";
  }

  const durationLabel: Record<string, string> = {
    "3": "3 minutes", "5": "5 minutes", "10": "10 minutes",
    "15": "15 minutes", "20": "20 minutes",
  };

  return { targetWords, wordsPerPage, ageDescription, durationLabel: durationLabel[duration] || "5 minutes" };
}

// Medium and Long stories get split into chapters for natural stopping
// points and a stronger sense of narrative progression. Short/Quick flow
// as a single picture-book piece (chapters that small stop feeling like
// real chapters). Numbers based on ~6 pages per chapter at ages 4-7.
function getChapterCount(duration: string): number {
  if (duration === "10") return 3; // ~20 pages → 3 chapters of ~6-7 pages
  if (duration === "15") return 5; // ~30 pages → 5 chapters of ~6 pages
  return 0;
}

export async function generateStoryWithAI(request: StoryRequest): Promise<GeneratedStory> {
  const { targetWords, wordsPerPage, ageDescription, durationLabel } = getStoryParams(request.duration, request.age);
  const chapterCount = getChapterCount(request.duration);

  const prompt = `You are a beloved children's story author. Write a read-along story.

Hero: ${request.heroName} (a ${request.heroType})
Genre: ${request.genre}
Reading level: ${ageDescription}
Obstacle: ${request.obstacle || "something unexpected that challenges the hero"}
Lesson: ${request.lesson || "Be brave"}
Special requests: ${request.extras || "none"}

TARGET LENGTH: ${targetWords} words total (approximately ${durationLabel} of read-aloud time).

IMPORTANT — CHARACTER DESCRIPTION:
First, create a detailed visual description of the main character. This is CRITICAL for illustration consistency.
- The hero ${request.heroName} IS A ${request.heroType.toUpperCase()}. This is non-negotiable. ${request.heroName} must visually BE a ${request.heroType} on every single page, not a human standing next to one. The character's species/form is ${request.heroType}.
- If ${request.heroType} is a non-human creature (mermaid, dragon, unicorn, fairy, robot, dinosaur, etc.), the character description MUST describe the anatomical features of that creature (e.g. for a mermaid: "a young mermaid with a shimmering turquoise fish tail, iridescent scales, seashell top, long wavy auburn hair floating around her, freckles across her nose"). Do NOT describe ${request.heroName} as a human who happens to meet a ${request.heroType}.
- "${request.heroName}" is ONLY a name — do NOT interpret it literally (e.g. "Teddy" is a ${request.heroType} named Teddy, NOT a teddy bear; "Kitty" is a ${request.heroType} named Kitty, NOT a cat).
- Describe specific physical features appropriate to a ${request.heroType}: body/form, coloring, distinguishing features, clothing or adornments (if applicable), and anything that makes them unique.
- Keep these details EXACTLY the same on every page.
- Include this full character description at the start of EVERY scene/illustration prompt so the illustrator draws the same character each time.

IMPORTANT — ILLUSTRATION PROMPTS (SCENE FIELD):
These scene descriptions go DIRECTLY to an image generator. The image generator will attempt to visually render ANY readable content it finds — dialogue, names, titles, sign text — as garbled, misspelled visible marks in the painting. This ruins the illustration. You MUST follow these rules strictly:

1. ONLY describe what the camera sees: character poses, facial expressions, body language, environment, lighting, colors, textures, weather, objects.
2. NEVER include any of these in scene descriptions:
   - Quoted speech or dialogue of any kind
   - Character names written as if on a surface (e.g. "Bobby on the crystal" — the model draws this as a caption)
   - Signs, banners, posters, or anything that implies readable content
   - Books described with specific titles or visible open pages — books are fine in scenes, just describe them as "a colorful book" or "a stack of books", never with a readable title
   - Chalkboards, whiteboards, screens, or displays with anything on them — if they appear, describe them as blank or decorated with abstract doodles
   - The phrases "saying", "reading", "that says", "titled", "labeled", "the word", "the name"
3. Instead of dialogue, describe the emotion: "cupping hands around mouth, face full of worry" instead of "calling out 'Where are you?'"
4. Instead of "a welcome sign at the gate", write "a decorative archway at the gate"
5. Instead of "a book titled Adventures", write "a closed book with a colorful painted cover"
6. Every "scene" prompt MUST open with a sentence identifying ${request.heroName} as the ${request.heroType} being shown. Example opener: "A ${request.heroType} with [character description features] [action]…"
7. Then paste the full character description verbatim.
8. Then describe the setting and action using purely visual language.
- If the scene involves other ${request.heroType}s (e.g. Olivia's mermaid friends), make it explicit which one is ${request.heroName} by referring back to their unique features so the illustrator can't confuse the hero with a background character.
- For Page 1 specifically: this is the child's first look at their hero. The illustration MUST clearly show ${request.heroName} as the ${request.heroType} — centered, unmistakable, matching the character description exactly.

IMPORTANT RULES:
- Write approximately ${targetWords} words total
- Break the story into pages. Each page = one scene or moment (each page gets its own illustration)
- Each page should be ${wordsPerPage} words
- Age-appropriate vocabulary and sentence length
- Warm, gentle tone. Never scary. Always hopeful.
- Weave the lesson naturally — never preach
- Include sensory details (sounds, colors, textures, smells)
- The story needs a clear beginning, rising action, climax, and satisfying resolution
- For longer stories (10+ min), include subplots, secondary characters, and richer world-building
- For ages 2-4: very simple words, 1-2 short sentences per page
- For ages 4-7: richer vocabulary, 2-4 sentences per page
- For ages 7-10: complex narrative, 3-6 sentences per page
${chapterCount > 0 ? `
CHAPTERS:
- This story MUST be divided into EXACTLY ${chapterCount} chapters.
- Distribute pages roughly evenly across chapters (each chapter should have a similar page count).
- Each chapter should contain its own mini-arc: a small setup, a turn, and a transition into the next chapter. The FINAL chapter carries the climax and resolution.
- Give each chapter a short, evocative title (2-5 words, title case, no number prefix — e.g. "A Strange Package", "The Dark Forest", "Home at Last"). Titles should hint at what happens in that chapter without spoiling it.
- On the FIRST page of each chapter, set the "chapterTitle" field to the chapter's title string. On EVERY other page, omit the "chapterTitle" field entirely (or set it to null). Page 1 of the story is always the first page of Chapter 1.
` : ""}
For each page, provide an illustration prompt in the "scene" field. EVERY scene prompt MUST start with the full character description so the character looks identical on every page. Then describe the setting, action, and details.

Return valid JSON only, no other text:
{
  "title": "...",
  "emoji": "...",
  "characterDescription": "A detailed visual description of the main character (e.g. 'A 6-year-old boy with curly brown hair, light brown skin, big round hazel eyes, wearing a bright red hoodie, blue jeans, and green sneakers')",
  "pages": [
    {
      "label": "Page 1",
      "text": "story text for this page...",
      "scene": "illustration prompt: [character description repeated here] + what the picture should show",
      "mood": "peaceful|exciting|funny|mysterious|warm|triumphant",
      "sounds": ["birds chirping", "wind rustling"]${chapterCount > 0 ? `,
      "chapterTitle": "A Short Chapter Title (only on the first page of each chapter; omit or null on other pages)"` : ""}
    }
  ]
}`;

  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      { role: "user", content: prompt },
    ],
  });

  // Extract the text content
  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from AI");
  }

  // Parse the JSON from the response
  const jsonText = textContent.text.trim();
  // Handle case where response might be wrapped in ```json ... ```
  const cleaned = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");

  const story: GeneratedStory = JSON.parse(cleaned);

  // Validate the response
  if (!story.title || !story.pages || !Array.isArray(story.pages) || story.pages.length === 0) {
    throw new Error("Invalid story response from AI");
  }

  return story;
}
