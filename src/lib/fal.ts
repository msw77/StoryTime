import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY,
});

// IMPORTANT: the "ABSOLUTELY NO …" block at the end is load-bearing.
// fal.ai models (both imagen4 and nano-banana) will cheerfully render
// speech bubbles, comic-style text, handwritten signs, book titles,
// and "letter-like" gibberish inside illustrations unless explicitly
// told not to — and when they do, the letters are almost always
// misspelled or garbled, which breaks the read-along illusion for
// parents. The repeated phrasing is intentional: these models weight
// the LAST instructions most heavily, so we restate the ban multiple
// ways (text, words, letters, speech bubbles, signs, labels) to
// maximize the chance it sticks.
const STYLE_PREFIX = `Warm, friendly children's book illustration in soft watercolor style. Simple shapes, rounded edges, warm natural lighting. Gentle color palette with soft blues, greens, and warm yellows. No scary or dark elements. Characters have large, expressive eyes and friendly expressions. Style is consistent with a modern children's picture book for ages 2-8.

ABSOLUTELY NO TEXT of any kind in the image: no words, no letters, no numbers, no writing, no captions, no titles, no labels, no signs, no book titles, no newspaper text, no handwritten notes, no chalkboards with writing, no alphabet blocks with letters on them. ABSOLUTELY NO speech bubbles, thought bubbles, word balloons, or comic-book dialogue boxes. The illustration must communicate the scene purely through visuals — if you were going to add text, add more visual detail instead.`;

interface GenerateImageResult {
  url: string;
  pageIndex: number;
}

export async function generatePageImage(
  sceneDescription: string,
  mood: string,
  pageIndex: number,
  characterDescription?: string,
): Promise<GenerateImageResult> {
  // Build prompt with character description for consistency across pages
  const charBlock = characterDescription
    ? `\n\nMain character (MUST match this description exactly on every page): ${characterDescription}`
    : "";
  const prompt = `${STYLE_PREFIX}${charBlock}\n\nScene: ${sceneDescription}\nMood: ${mood}`;

  // Imagen 4 Fast: ~5s/image vs ~48s on nano-banana-2, better prompt adherence,
  // and better character consistency across pages. Revert to "fal-ai/nano-banana-2"
  // if we ever want the softer watercolor look back.
  const result = await fal.subscribe("fal-ai/imagen4/preview/fast", {
    input: {
      prompt,
      aspect_ratio: "16:9",
      num_images: 1,
      output_format: "png",
    },
  });

  const data = result.data as { images: { url: string }[] };
  if (!data.images || data.images.length === 0) {
    throw new Error("No image returned from fal.ai");
  }

  return {
    url: data.images[0].url,
    pageIndex,
  };
}
