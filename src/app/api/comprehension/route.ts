import { createServiceClient } from "@/lib/supabase";
import {
  parseJsonBody,
  requireDbUserId,
  validateChildProfileOwnership,
} from "@/lib/api-helpers";
import { NextResponse } from "next/server";
import { z } from "zod";

// POST /api/comprehension — log a child's answer to a Story Questions
// comprehension check. One row per question answered. Powers the
// parent dashboard's "Understanding" card (recall/inference/connection
// accuracy breakdowns).
//
// The child never sees the correct/incorrect flag surface as a score.
// It's logged purely for the parent dashboard.
const logAnswerSchema = z.object({
  childProfileId: z.string().uuid(),
  storyId: z.string().min(1),
  questionIdx: z.number().int().min(0),
  questionType: z.enum(["recall", "inference", "connection"]),
  chosenOptionIdx: z.number().int().min(0),
  correct: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const parsed = await parseJsonBody(req, logAnswerSchema);
    if (!parsed.ok) return parsed.response;
    const {
      childProfileId,
      storyId,
      questionIdx,
      questionType,
      chosenOptionIdx,
      correct,
    } = parsed.value;

    const ownCheck = await validateChildProfileOwnership(dbUserId, childProfileId);
    if (!ownCheck.ok) return ownCheck.response;

    const supabase = createServiceClient();
    const { error } = await supabase.from("comprehension_responses").insert({
      child_profile_id: childProfileId,
      story_id: storyId,
      question_idx: questionIdx,
      question_type: questionType,
      chosen_option_idx: chosenOptionIdx,
      correct,
    });
    if (error) {
      console.error("comprehension insert failed:", error);
      return NextResponse.json({ error: "insert failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("comprehension POST error:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

// GET /api/comprehension?childProfileId=...&sinceDays=7
// Recent responses for a child, used by the parent dashboard. Default
// window is 7 days.
export async function GET(req: Request) {
  try {
    const userResult = await requireDbUserId();
    if (!userResult.ok) return userResult.response;
    const dbUserId = userResult.value;

    const url = new URL(req.url);
    const childProfileId = url.searchParams.get("childProfileId");
    const sinceDays = Number(url.searchParams.get("sinceDays") ?? "7");

    if (!childProfileId) {
      return NextResponse.json({ error: "childProfileId required" }, { status: 400 });
    }

    const ownCheck = await validateChildProfileOwnership(dbUserId, childProfileId);
    if (!ownCheck.ok) return ownCheck.response;

    const sinceIso = new Date(
      Date.now() - Math.max(0, sinceDays) * 86_400_000,
    ).toISOString();

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("comprehension_responses")
      .select("story_id, question_idx, question_type, chosen_option_idx, correct, answered_at")
      .eq("child_profile_id", childProfileId)
      .gte("answered_at", sinceIso)
      .order("answered_at", { ascending: false });

    if (error) {
      console.error("comprehension GET failed:", error);
      return NextResponse.json({ error: "load failed" }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("comprehension GET error:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
