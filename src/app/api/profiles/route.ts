import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

// Helper: get the Supabase user ID from Clerk ID
async function getDbUserId(clerkId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_id", clerkId)
    .single();
  return data?.id || null;
}

// GET /api/profiles — list child profiles for the current user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json([], { status: 200 });
    }

    const dbUserId = await getDbUserId(userId);
    if (!dbUserId) {
      return NextResponse.json([]);
    }

    const supabase = createServiceClient();
    const { data: profiles } = await supabase
      .from("child_profiles")
      .select("id, name, age, avatar_emoji")
      .eq("user_id", dbUserId)
      .order("created_at");

    return NextResponse.json(profiles || []);
  } catch (err) {
    console.error("Profiles GET error:", err);
    return NextResponse.json([], { status: 200 });
  }
}

// POST /api/profiles — create a new child profile
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { name, age, avatar_emoji } = await req.json();

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const dbUserId = await getDbUserId(userId);
    if (!dbUserId) {
      return NextResponse.json({ error: "User not found in database" }, { status: 404 });
    }

    const supabase = createServiceClient();
    const { data: profile, error } = await supabase
      .from("child_profiles")
      .insert({
        user_id: dbUserId,
        name: name.trim(),
        age: age || null,
        avatar_emoji: avatar_emoji || "🧒",
      })
      .select("id, name, age, avatar_emoji")
      .single();

    if (error) {
      console.error("Failed to create profile:", error);
      return NextResponse.json({ error: "Database error", details: error.message }, { status: 500 });
    }

    return NextResponse.json(profile);
  } catch (err) {
    console.error("Profiles POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
