import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

// GET /api/user — get or create the current user in Supabase
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Try to find existing user. We intentionally ignore the "no rows"
    // error here — the insert below handles the not-found case.
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, subscription_status")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(existingUser);
    }

    // Create new user if not found
    const { data: newUser, error: createError } = await supabase
      .from("users")
      .insert({ clerk_id: userId })
      .select("id, subscription_status")
      .single();

    if (createError) {
      console.error("Failed to create user:", createError);
      return NextResponse.json({ error: "Database error", details: createError.message }, { status: 500 });
    }

    return NextResponse.json(newUser);
  } catch (err) {
    console.error("User API error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
