import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

// GET /api/reading-history — fetch recent reading history
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json([]);
    }

    // Get the 20 most recent reads, newest first
    const { data: history, error } = await supabase
      .from("reading_history")
      .select("*")
      .eq("user_id", user.id)
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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { storyId, storyTitle, storyEmoji, storyGenre, storyAge, storyColor, isGenerated, totalPages, childProfileId } = body;

    const { data: entry, error } = await supabase
      .from("reading_history")
      .insert({
        user_id: user.id,
        child_profile_id: childProfileId || null,
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
