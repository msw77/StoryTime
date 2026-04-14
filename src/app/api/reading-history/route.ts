import { createServiceClient } from "@/lib/supabase";
import {
  parseJsonBody,
  requireDbUserId,
  validateChildProfileOwnership,
} from "@/lib/api-helpers";
import { logReadingSchema } from "@/lib/schemas";
import { NextResponse } from "next/server";

// GET /api/reading-history — fetch recent reading history
export async function GET() {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const supabase = createServiceClient();

    // Get the 20 most recent reads, newest first
    const { data: history, error } = await supabase
      .from("reading_history")
      .select("*")
      .eq("user_id", dbUserId)
      .order("started_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to load reading history:", error);
      return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
    }

    return NextResponse.json(history || []);
  } catch (err) {
    console.error("Reading history GET error:", err);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}

// POST /api/reading-history — log that a story was opened/read
export async function POST(req: Request) {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const parsed = await parseJsonBody(req, logReadingSchema);
    if (!parsed.ok) return parsed.response;
    const {
      storyId, storyTitle, storyEmoji, storyGenre, storyAge, storyColor,
      isGenerated, totalPages, childProfileId,
    } = parsed.value;

    // IDOR fix: same as /api/stories — verify the child_profile_id
    // actually belongs to the caller before we tag this read with it.
    const profileCheck = await validateChildProfileOwnership(dbUserId, childProfileId);
    if (!profileCheck.ok) return profileCheck.response;
    const verifiedChildProfileId = profileCheck.value;

    const supabase = createServiceClient();

    const { data: entry, error } = await supabase
      .from("reading_history")
      .insert({
        user_id: dbUserId,
        child_profile_id: verifiedChildProfileId,
        story_id: storyId,
        story_title: storyTitle,
        story_emoji: storyEmoji || "📖",
        story_genre: storyGenre,
        story_age: storyAge,
        story_color: storyColor,
        is_generated: isGenerated || false,
        total_pages: totalPages || 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to log reading history:", error);
      return NextResponse.json({ error: "Failed to log history" }, { status: 500 });
    }

    return NextResponse.json(entry);
  } catch (err) {
    console.error("Reading history POST error:", err);
    return NextResponse.json({ error: "Failed to log history" }, { status: 500 });
  }
}
