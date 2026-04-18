import Anthropic from "@anthropic-ai/sdk";
import { logApiUsage } from "@/lib/costTracking";
import { normalizeGeneratedStory } from "@/lib/textNormalization";

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

interface GeneratedVocabWord {
  word: string;
  emoji: string;
  definition_2_4: string | null;
  definition_4_7: string;
  definition_7_10: string;
  exampleSentence: string;
  pronunciation: string;
}

interface GeneratedReadAloudWord {
  word: string;
  syllables: string[];
  phonicsLevel: "easy" | "intermediate" | "hard";
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
  // Science-of-Reading extensions (Word Glow, Sound It Out, Read It Yourself)
  vocabWords?: GeneratedVocabWord[];
  readAloudWords?: GeneratedReadAloudWord[];
}

interface GeneratedComprehensionQuestion {
  type: "recall" | "inference" | "connection";
  question: string;
  options: Array<{ text: string; emoji: string; correct: boolean }>;
}

interface GeneratedPredictionPause {
  atPageIdx: number;
  question: string;
  options: Array<{ text: string; emoji: string }>;
}

interface GeneratedStory {
  title: string;
  emoji: string;
  characterDescription: string;
  pages: GeneratedPage[];
  // Science-of-Reading story-level fields
  comprehensionQuestions?: GeneratedComprehensionQuestion[];
  predictionPause?: GeneratedPredictionPause;
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

IMPORTANT — READ-ALONG WORD HIGHLIGHTING:
The story is narrated aloud while each word is highlighted on screen in
sync with the audio. For the highlight to land on the right word at the
right moment, the text MUST avoid patterns that confuse speech-to-text
alignment:
- Write ALL numbers as words, not digits. "eleven" not "11", "nineteen
  sixty-nine" not "1969", "five minutes" not "5 minutes". This includes
  years, ages, counts, and quantities.
- Avoid hyphenated compound words. "ten year old boy" not "ten-year-old",
  "well known" not "well-known", "good bye" not "good-bye".
- Use commas or periods instead of em-dashes or en-dashes. Write "She
  stopped, just for a moment." never "She stopped — just for a moment."
  Do not use the characters — or – anywhere in the text.
- Contractions ("don't", "can't", "it's") are fine — keep them natural.

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

IMPORTANT — READING-SCIENCE FIELDS (required):
In addition to the narrative fields, generate reading-science metadata
for each page and each story. These power features that actively help
the child learn to read (Word Glow vocabulary, Sound It Out
syllabification, end-of-story comprehension questions).

vocabWords (3-5 per page):
- Pick words just above the kid's comfortable reading level —
  challenging but reachable from context. Favor concrete nouns, vivid
  verbs, sensory adjectives.
- Avoid words a kid that age will already know from daily life
  ("house", "happy", "ran", "mom").
- For each word: { word, emoji, definition_2_4, definition_4_7,
  definition_7_10, exampleSentence, pronunciation }
- definition_2_4: null for the 2-4 band (too young for text).
- definition_4_7: one sentence, 8-14 words, everyday language.
- definition_7_10: one sentence, 12-20 words, slightly richer; may
  include a light metaphor.
- exampleSentence: one sentence using the word in a DIFFERENT context
  from the story's sentence.
- pronunciation: capitalized syllabic form, e.g. "CAN-yun", "eh-KOH".
- emoji: one emoji that evokes the word's meaning.

readAloudWords (2-3 per page, can overlap with vocabWords):
- Words suitable for the child to sound out or attempt to read.
- { word, syllables (PHONETIC not orthographic), phonicsLevel }
- syllables: how the word is SPOKEN. "table" → ["tay", "bul"], NOT
  ["ta", "ble"]. Single-syllable words have a one-element array.
- phonicsLevel: 'easy' (CVC, short vowels) | 'intermediate' (long
  vowels, digraphs, r-controlled) | 'hard' (irregular, multi-syll,
  schwa patterns). Age 4-7 should mostly get 'easy'-'intermediate';
  age 7-10 can handle 'intermediate'-'hard'.

comprehensionQuestions (story-level):
- 2-3 questions for age 4-7; 3 questions for age 7-10. OMIT this field
  entirely for age 2-4 (too young for MCQ comprehension).
- Each question: { type, question, options: [{text, emoji, correct}] }
- type: 'recall' (what literally happened) | 'inference' (why/how) |
  'connection' (ties to the child's own experience).
- Exactly 3 options per question.
- For recall/inference: exactly ONE option has correct: true.
- For connection questions: ALL options have correct: true (there are
  no wrong answers about the child's own feelings).
- Questions are WARM and CONVERSATIONAL — never quiz-style, never
  "Which of the following best describes..."
- Each option has a matching emoji as visual anchor.

predictionPause (story-level, optional — include for ages 4-7 and 7-10):
- Exactly 1 per story. OMIT this field for age 2-4.
- Pick the page with the most "what happens next" tension (usually
  mid-story, after setup but before climax).
- { atPageIdx (0-indexed), question, options: [{text, emoji}] }
- options: 2-3 plausible predictions. No correct field — all valid.

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
      "sounds": ["birds chirping", "wind rustling"],
      "vocabWords": [
        {
          "word": "canyon",
          "emoji": "🏜️",
          "definition_2_4": null,
          "definition_4_7": "A very deep valley with tall rocky walls.",
          "definition_7_10": "A deep, narrow valley between cliffs, often carved by a river over millions of years.",
          "exampleSentence": "We hiked along the edge of the canyon and heard our echoes bounce back.",
          "pronunciation": "CAN-yun"
        }
      ],
      "readAloudWords": [
        { "word": "canyon", "syllables": ["can", "yun"], "phonicsLevel": "intermediate" }
      ]${chapterCount > 0 ? `,
      "chapterTitle": "A Short Chapter Title (only on the first page of each chapter; omit or null on other pages)"` : ""}
    }
  ],
  "comprehensionQuestions": [
    {
      "type": "recall",
      "question": "What did Mia find in her grandmother's book?",
      "options": [
        { "text": "A crinkled map", "emoji": "🗺️", "correct": true },
        { "text": "A small key", "emoji": "🗝️", "correct": false },
        { "text": "A letter", "emoji": "✉️", "correct": false }
      ]
    }
  ],
  "predictionPause": {
    "atPageIdx": 4,
    "question": "What do you think Mia will do next?",
    "options": [
      { "text": "Keep following the map", "emoji": "🚶‍♀️" },
      { "text": "Run back home", "emoji": "🏠" },
      { "text": "Ask the fox for help", "emoji": "🦊" }
    ]
  }
}`;

  const anthropic = getClient();
  const model = "claude-sonnet-4-20250514";
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    messages: [
      { role: "user", content: prompt },
    ],
  });

  // Fire-and-forget cost logging. Category is "user-story" since this
  // path runs when a parent generates a custom story through the app.
  logApiUsage({
    provider: "anthropic",
    operation: "story-generation",
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    category: "user-story",
    metadata: {
      pageCount: response.usage?.output_tokens ? undefined : undefined,
    },
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

  // Belt-and-suspenders: even though the prompt tells Claude to write
  // numbers as words and avoid em-dashes, the model occasionally slips.
  // Running every page's `text` through the normalizer guarantees the
  // display text matches what TTS will say, which keeps the word-
  // highlight reconciler happy. See src/lib/textNormalization.ts.
  return normalizeGeneratedStory(story);
}
