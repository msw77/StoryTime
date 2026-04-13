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
}

interface GeneratedStory {
  title: string;
  emoji: string;
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

export async function generateStoryWithAI(request: StoryRequest): Promise<GeneratedStory> {
  const { targetWords, wordsPerPage, ageDescription, durationLabel } = getStoryParams(request.duration, request.age);

  const prompt = `You are a beloved children's story author. Write a read-along story.

Hero: ${request.heroName} (a ${request.heroType})
Genre: ${request.genre}
Reading level: ${ageDescription}
Obstacle: ${request.obstacle || "something unexpected that challenges the hero"}
Lesson: ${request.lesson || "Be brave"}
Special requests: ${request.extras || "none"}

TARGET LENGTH: ${targetWords} words total (approximately ${durationLabel} of read-aloud time).

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

For each page, also provide an illustration prompt describing the visual scene.

Return valid JSON only, no other text:
{
  "title": "...",
  "emoji": "...",
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

  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
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
