import { auth } from "@clerk/nextjs/server";
import { generatePageImage } from "@/lib/fal";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json();
    const { pages, characterDescription } = body;

    // pages should be an array of { scene, mood, index } objects
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: "No pages provided" }, { status: 400 });
    }

    // Generate all requested images in parallel
    const results = await Promise.allSettled(
      pages.map((page: { scene: string; mood: string; index?: number }, i: number) =>
        generatePageImage(page.scene, page.mood || "warm", page.index ?? i, characterDescription)
      )
    );

    // Build array of results with page indices
    const images: { index: number; url: string | null }[] = results.map((r, i) => {
      if (r.status === "fulfilled") {
        return { index: r.value.pageIndex, url: r.value.url };
      } else {
        console.error("Image generation failed for page:", r.reason);
        return { index: pages[i].index ?? i, url: null };
      }
    });

    console.log(`Generated ${images.filter((img) => img.url).length}/${images.length} images`);
    return NextResponse.json({ images });
  } catch (err) {
    console.error("Image generation error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to generate images", details: message }, { status: 500 });
  }
}
