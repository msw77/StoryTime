import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

// GET /api/stories — load user's saved AI stories
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Find the user by Clerk ID
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json([]);
    }

    // Get all their generated stories, newest first
    const { data: stories, error } = await supabase
      .from("stories")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_generated", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load stories:", error);
      return NextResponse.json({ error: "Failed to load stories" }, { status: 500 });
    }

    return NextResponse.json(stories || []);
  } catch (err) {
    console.error("Stories GET error:", err);
    return NextResponse.json({ error: "Failed to load stories" }, { status: 500 });
  }
}

// DELETE /api/stories — delete a saved story
export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Find the user by Clerk ID
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get("id");

    if (!storyId) {
      return NextResponse.json({ error: "Missing story id" }, { status: 400 });
    }

    // Only allow deleting their own stories
    const { error } = await supabase
      .from("stories")
      .delete()
      .eq("id", storyId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to delete story:", error);
      return NextResponse.json({ error: "Failed to delete story" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Stories DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete story" }, { status: 500 });
  }
}

// POST /api/stories — save a generated story
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Find the user by Clerk ID
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { title, emoji, genre, age, pages, duration, heroName, heroType, lesson, extras, childProfileId } = body;

    const { data: story, error } = await supabase
      .from("stories")
      .insert({
        user_id: user.id,
        child_profile_id: childProfileId || null,
        title,
        emoji: emoji || "✨",
        genre,
        age_group: age,
        pages: JSON.stringify(pages),
        hero_name: heroName || null,
        hero_type: heroType || null,
        lesson: lesson || null,
        extras: extras || null,
        is_generated: true,
        is_built_in: false,
        page_count: pages?.length || 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to save story:", error);
      return NextResponse.json({ error: "Failed to save story" }, { status: 500 });
    }

    return NextResponse.json(story);
  } catch (err) {
    console.error("Stories POST error:", err);
    return NextResponse.json({ error: "Failed to save story" }, { status: 500 });
  }
}
