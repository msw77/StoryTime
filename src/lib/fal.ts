import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY,
});

const STYLE_PREFIX = `Warm, friendly children's book illustration in soft watercolor style. Simple shapes, rounded edges, warm natural lighting. Gentle color palette with soft blues, greens, and warm yellows. No text in the image. No scary or dark elements. Characters have large, expressive eyes and friendly expressions. Style is consistent with a modern children's picture book for ages 2-8.`;

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

  const result = await fal.subscribe("fal-ai/nano-banana-2", {
    input: {
      prompt,
      aspect_ratio: "16:9",
      num_images: 1,
      output_format: "png",
      safety_tolerance: 1,
      resolution: "1K",
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
