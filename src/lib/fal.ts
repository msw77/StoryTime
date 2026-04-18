import { fal } from "@fal-ai/client";
import { logApiUsage } from "@/lib/costTracking";

fal.config({
  credentials: process.env.FAL_KEY,
});

// Style prefix — describes the look/feel. The no-text instructions
// used to live here, but Imagen 4 weights the END of the prompt most
// heavily, so we moved the textless-illustration block into a
// separate TEXTLESS_SUFFIX that gets appended AFTER the scene
// description. See buildPrompt() below.
const STYLE_PREFIX = `Warm, friendly children's book illustration in soft watercolor style. Simple shapes, rounded edges, warm natural lighting. Gentle color palette with soft blues, greens, and warm yellows. No scary or dark elements. Characters have large, expressive eyes and friendly expressions. Style is consistent with a modern children's picture book for ages 2-8.`;

// Wordless-illustration directive — 100% POSITIVE phrasing only.
// Diffusion models have an attention mechanism that picks up tokens
// like "text", "words", "letters", "speech bubbles" even when
// preceded by "no" or "without", because the negation is ignored at
// the cross-attention level. Every mention of a text-related concept
// — even a banned one — increases the chance of rendering it.
//
// The fix: describe what the image IS (wordless, silent, purely
// painted) and never mention any text-related concept at all. We
// also avoid words like "sign", "label", "caption", "title",
// "bubble" entirely so those tokens never enter the latent space.
const TEXTLESS_SUFFIX = `STYLE: Wordless painted illustration. Purely visual storytelling through expressions, body language, color, and lighting. Every surface is smooth, clean, and unadorned. Walls are bare. All surfaces show only color, pattern, or texture — never anything readable. Silent scene. The entire image is a single cohesive painting with nothing overlaid.`;

interface GenerateImageResult {
  url: string;
  pageIndex: number;
}

export async function generatePageImage(
  sceneDescription: string,
  mood: string,
  pageIndex: number,
  characterDescription?: string,
  heroType?: string,
): Promise<GenerateImageResult> {
  // Build prompt with character description for consistency across pages
  const charBlock = characterDescription
    ? `\n\nMain character (MUST match this description exactly on every page): ${characterDescription}`
    : "";
  // Belt-and-braces reinforcement: when we know the hero's species/form
  // (mermaid, dragon, unicorn, etc.) we restate it as a top-level SUBJECT
  // directive. Claude's characterDescription is the primary carrier of
  // this info, but duplicating it here means an Imagen misread of the
  // scene text can't accidentally draw "a girl standing next to a
  // mermaid" when the child picked mermaid. The line is only added for
  // non-trivial hero types — for "kid"/"boy"/"girl" it'd be noise.
  const trimmedHero = heroType?.trim();
  const subjectBlock =
    trimmedHero && trimmedHero.length > 0
      ? `\n\nSUBJECT: The main character IS a ${trimmedHero}. Draw them AS a ${trimmedHero}, not a human standing next to one. Their species/form is ${trimmedHero}. This is non-negotiable.`
      : "";
  // Sanitize the scene description: strip anything that looks like
  // readable content that Imagen might try to render as visible text.
  // - Quoted dialogue ("Hello!", 'Where are you?')
  // - Phrases like "a sign saying ___" or "a banner reading ___"
  // - Phrases like "the word[s] ___" or "titled ___"
  // This preserves the visual description while removing text triggers.
  const sanitized = sceneDescription
    .replace(/["'"'][^"'"']*["'"']/g, "") // strip quoted strings
    .replace(/\b(saying|reading|that says|that reads|titled|labeled|written|writes|inscription)\b[^.,;]*/gi, "") // strip "a sign saying X"
    .replace(/\b(the words?|the letters?|the name)\b[^.,;]*/gi, "") // strip "the word X"
    .replace(/\s{2,}/g, " ") // collapse extra spaces
    .trim();

  const prompt = `${STYLE_PREFIX}${charBlock}${subjectBlock}\n\nScene: ${sanitized}\nMood: ${mood}\n\n${TEXTLESS_SUFFIX}`;

  // Imagen 4 Fast: ~5s/image vs ~48s on nano-banana-2, better prompt adherence,
  // and better character consistency across pages. Revert to "fal-ai/nano-banana-2"
  // if we ever want the softer watercolor look back.
  const model = "fal-ai/imagen4/preview/fast";
  const result = await fal.subscribe(model, {
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

  // Fire-and-forget cost logging. Category is "user-image" — this path
  // runs when a parent/child triggers an illustration generation in-app.
  logApiUsage({
    provider: "fal",
    operation: "image-generation",
    model,
    imagesGenerated: data.images.length,
    category: "user-image",
  });

  return {
    url: data.images[0].url,
    pageIndex,
  };
}
