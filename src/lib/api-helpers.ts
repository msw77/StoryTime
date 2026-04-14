import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z, ZodError, ZodType } from "zod";
import { createServiceClient } from "@/lib/supabase";

// ─── Shared API helpers ──────────────────────────────────────────────────────
//
// This module centralises the plumbing that every API route in the app needs:
//
//   1. Require an authenticated Clerk user.
//   2. Resolve that Clerk user to a row in our Supabase `users` table.
//   3. Validate and parse the request body against a zod schema.
//   4. Verify that any child_profile_id the caller passes actually belongs
//      to the current user (to prevent a logged-in user from attaching
//      records to someone else's child profile — the IDOR issue Codex
//      flagged in Sitting 2 findings #7).
//
// Keeping these in one file means:
//   - Every route gets the same auth + ownership behaviour for free.
//   - If the auth library changes, or the Supabase schema changes, there's
//     one place to update instead of ten.
//   - Validation errors land on the client in a consistent 400-shape so the
//     UI can surface them uniformly.
//
// Returning `NextResponse` vs. throwing: we use a `Result` pattern here so
// each route can short-circuit cleanly without try/catch gymnastics.

export type HelperFailure = { ok: false; response: NextResponse };
export type HelperSuccess<T> = { ok: true; value: T };
export type HelperResult<T> = HelperSuccess<T> | HelperFailure;

function fail(message: string, status: number): HelperFailure {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}

/**
 * Require an authenticated Clerk user. Returns the Clerk user id, or a
 * 401 NextResponse the caller should return directly.
 */
export async function requireClerkUser(): Promise<HelperResult<string>> {
  const { userId } = await auth();
  if (!userId) return fail("Not signed in", 401);
  return { ok: true, value: userId };
}

/**
 * Require an authenticated Clerk user AND resolve them to a row in the
 * Supabase `users` table. Callers get back the Supabase user id (a UUID).
 *
 * Returns 401 if not signed in, 404 if the Clerk user isn't mirrored into
 * Supabase yet (shouldn't happen after first sign-in since /api/user
 * auto-creates the row, but we handle it defensively).
 */
export async function requireDbUserId(): Promise<HelperResult<string>> {
  const clerk = await requireClerkUser();
  if (!clerk.ok) return clerk;

  const supabase = createServiceClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_id", clerk.value)
    .single();

  if (!user) return fail("User not found", 404);
  return { ok: true, value: user.id as string };
}

/**
 * Verify that the given child_profile_id belongs to the given Supabase
 * user. Use this before any write that tags data with a child_profile_id
 * from the client — the client cannot be trusted to only send profile ids
 * they own, so we must re-check server-side.
 *
 * Accepts null/undefined for the optional profile case (story not tied to
 * any child profile) and treats that as valid — the caller can decide
 * whether null is allowed for their endpoint.
 */
export async function validateChildProfileOwnership(
  dbUserId: string,
  childProfileId: string | null | undefined,
): Promise<HelperResult<string | null>> {
  if (!childProfileId) return { ok: true, value: null };

  // UUID shape check first — avoids a DB round trip on obviously-bad input
  // and lets us return a precise error instead of a generic "not found".
  if (!z.string().uuid().safeParse(childProfileId).success) {
    return fail("Invalid child profile id", 400);
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("child_profiles")
    .select("id")
    .eq("id", childProfileId)
    .eq("user_id", dbUserId)
    .maybeSingle();

  if (!profile) {
    // 403, not 404: we don't want to leak whether the profile exists at
    // all — just that the current user can't use it. Same shape either way.
    return fail("Child profile not found or not yours", 403);
  }

  return { ok: true, value: profile.id as string };
}

/**
 * Parse and validate a request body against a zod schema. Returns the
 * typed value on success, or a 400 NextResponse with the zod issues
 * flattened into a compact error string.
 *
 * We deliberately strip zod's rich error structure down to a human-readable
 * line per issue, because this project has a non-technical operator — noisy
 * stack traces in logs are a nuisance. The client still gets enough detail
 * to know what was wrong.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<HelperResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("Invalid JSON body", 400);
  }

  try {
    const parsed = schema.parse(raw);
    return { ok: true, value: parsed };
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return fail(`Validation failed: ${issues}`, 400);
    }
    return fail("Validation failed", 400);
  }
}
