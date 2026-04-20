import { generatePageImage } from "@/lib/fal";
import { parseJsonBody, requireClerkUser } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateImagesSchema } from "@/lib/schemas";
import { NextResponse } from "next/server";

/**
 * Explicit serverless-function timeout. Each fal.ai image call takes
 * ~30s (sometimes 45s+ when fal is congested), and this route batches
 * up to 3 pages in parallel via Promise.allSettled. Without this
 * export, Vercel applies its platform default — 10s on Hobby,
 * 60s on Pro — and a Hobby-plan deploy would silently time out on
 * every image request.
 *
 * 60s gives enough headroom for slow fal responses while staying
 * within the Hobby-plan cap. Pro could go higher (up to 300s) if
 * we need it later for very long stories, but the in-reader batch
 * size of 3 means 60s has been plenty in practice.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const clerk = await requireClerkUser();
    if (!clerk.ok) return clerk.response;

    // Per-user cap on image generation requests (60/hour). Each request
    // can still fan out up to IMAGE_PAGES_MAX pages (see schema), so this
    // layers on top of the payload cap from Sitting 2.
    const rl = await enforceRateLimit("generateImages", clerk.value);
    if (!rl.ok) return rl.response;

    // Schema enforces: 1..IMAGE_PAGES_MAX pages, scene is required and
    // bounded, mood/index are bounded, characterDescription is bounded.
    // This closes Codex finding #5 — before, a client could submit 500
    // pages and fan out 500 paid fal calls in a single request.
    const parsed = await parseJsonBody(req, generateImagesSchema);
    if (!parsed.ok) return parsed.response;
    const { pages, characterDescription, heroType } = parsed.value;

    // Generate all requested images in parallel
    const results = await Promise.allSettled(
      pages.map((page, i) =>
        generatePageImage(
          page.scene,
          page.mood || "warm",
          page.index ?? i,
          characterDescription ?? undefined,
          heroType ?? undefined,
        )
      )
    );

    // Build array of results with page indices
    const images: { index: number; url: string | null }[] = results.map((r, i) => {
      if (r.status === "fulfilled") {
        return { index: r.value.pageIndex, url: r.value.url };
      } else {
        // Surface the FULL error so we can diagnose failures. fal client errors
        // carry a .body field with the real message from the server.
        const reason = r.reason;
        console.error("Image generation failed for page:", {
          message: reason?.message,
          status: reason?.status,
          body: reason?.body,
          name: reason?.name,
        });
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
