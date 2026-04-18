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

// DELETE /api/profiles?id=<profile-id> — remove a child profile AND
// their saved stories. Scoped to the current user so one account can't
// touch another account's data. Deleting the stories alongside the
// profile is intentional: leaving orphaned stories around after the
// kid is gone would be confusing for parents and awkward for data-
// minimization / deletion requests.
export async function DELETE(req: Request) {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const url = new URL(req.url);
    const profileId = url.searchParams.get("id");
    if (!profileId) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Delete this profile's stories first (so the FK cascade — or manual
    // cleanup — doesn't leave orphans) then delete the profile itself.
    await supabase
      .from("stories")
      .delete()
      .eq("user_id", dbUserId)
      .eq("child_profile_id", profileId);

    const { error } = await supabase
      .from("child_profiles")
      .delete()
      .eq("id", profileId)
      .eq("user_id", dbUserId);

    if (error) {
      console.error("Failed to delete profile:", error);
      return NextResponse.json({ error: "Database error", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Profiles DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/profiles?id=<profile-id> — update fields on a child
// profile. Currently only `age` is editable via the manage-kids screen
// (name + avatar are set once at create time). Scoped to current user.
export async function PATCH(req: Request) {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const url = new URL(req.url);
    const profileId = url.searchParams.get("id");
    if (!profileId) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { age?: number | null };
    const updates: { age?: number | null } = {};
    if (body.age === null) {
      updates.age = null;
    } else if (typeof body.age === "number" && body.age >= 1 && body.age <= 18) {
      updates.age = body.age;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("child_profiles")
      .update(updates)
      .eq("id", profileId)
      .eq("user_id", dbUserId)
      .select("id, name, age, avatar_emoji")
      .single();

    if (error) {
      console.error("Failed to update profile:", error);
      return NextResponse.json({ error: "Database error", details: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Profiles PATCH error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
