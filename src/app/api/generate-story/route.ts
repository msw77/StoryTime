import { auth } from "@clerk/nextjs/server";
import { generateStoryWithAI } from "@/lib/anthropic";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json();
    const { heroName, heroType, genre, age, obstacle, lesson, extras, duration } = body;

    if (!heroName || !genre || !age) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

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
    });
  } catch (err) {
    console.error("Story generation error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to generate story", details: message }, { status: 500 });
  }
}
