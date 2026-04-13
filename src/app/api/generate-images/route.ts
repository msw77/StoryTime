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
    const { pages } = body;

    // pages should be an array of { scene, mood } objects
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: "No pages provided" }, { status: 400 });
    }

    // Generate all images in parallel
    const results = await Promise.allSettled(
      pages.map((page: { scene: string; mood: string }, index: number) =>
        generatePageImage(page.scene, page.mood || "warm", index)
      )
    );

    // Build array of image URLs (null for any that failed)
    const images: (string | null)[] = results.map((r) => {
      if (r.status === "fulfilled") {
        return r.value.url;
      } else {
        console.error("Image generation failed for a page:", r.reason);
        return null;
      }
    });

    console.log(`Generated ${images.filter(Boolean).length}/${images.length} images`);
    return NextResponse.json({ images });
  } catch (err) {
    console.error("Image generation error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to generate images", details: message }, { status: 500 });
  }
}
