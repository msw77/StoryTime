import { createServiceClient } from "@/lib/supabase";
import { parseJsonBody, requireDbUserId } from "@/lib/api-helpers";
import { createProfileSchema } from "@/lib/schemas";
import { NextResponse } from "next/server";

// GET /api/profiles — list child profiles for the current user
export async function GET() {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

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
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const parsed = await parseJsonBody(req, createProfileSchema);
    if (!parsed.ok) return parsed.response;
    const { name, age, avatar_emoji } = parsed.value;

    const supabase = createServiceClient();
    const { data: profile, error } = await supabase
      .from("child_profiles")
      .insert({
        user_id: dbUserId,
        name,
        age: age ?? null,
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
