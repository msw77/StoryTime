import { generateStoryWithAI } from "@/lib/anthropic";
import { parseJsonBody, requireClerkUser } from "@/lib/api-helpers";
import { generateStorySchema } from "@/lib/schemas";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const clerk = await requireClerkUser();
    if (!clerk.ok) return clerk.response;

    const parsed = await parseJsonBody(req, generateStorySchema);
    if (!parsed.ok) return parsed.response;
    const { heroName, heroType, genre, age, obstacle, lesson, extras, duration } = parsed.value;

    const story = await generateStoryWithAI({
      heroName,
      heroType: heroType || "kid",
      genre,
      age,
      obstacle: obstacle || "",
      lesson: lesson || "Be brave",
      extras: extras || "",
      duration: duration || "5",
    });

    // Convert pages to the [label, text] format used by the reader
    const pages: [string, string][] = story.pages.map((p) => [p.label, p.text]);

    return NextResponse.json({
      title: story.title,
      emoji: story.emoji,
      pages,
      // Store full page data for future use (illustrations, sound effects)
      fullPages: story.pages,
      // Character description for consistent illustrations
      characterDescription: story.characterDescription || "",
    });
  } catch (err) {
    console.error("Story generation error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to generate story", details: message }, { status: 500 });
  }
}
