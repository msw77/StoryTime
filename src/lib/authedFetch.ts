"use client";

/**
 * fetch() wrapper that recovers from transient Clerk session expiration.
 *
 * Why this exists: Vercel logs (2026-04-20) showed a pattern of 401
 * bursts on /api/tts and /api/generate-images — three in the same
 * second — followed immediately by 200s on the same endpoints when
 * retried. This means the Clerk session cookie was briefly stale and
 * then self-refreshed; the app was racing the refresh. Symptoms the
 * user saw:
 *   - Page 2 TTS returned 401; audio element tried to play a 401
 *     response and silently "played" a zero-byte stream, producing
 *     the "highlight advances silently then freezes" bug.
 *   - Page 2+ image generation returned 401; reader fell back to
 *     emoji art.
 *   - Tapping pause → play "fixed" audio because by that time the
 *     cookie had auto-refreshed.
 *
 * The fix: on a 401, force Clerk to reload the session (which
 * refreshes the auth cookie), then retry the request once. If the
 * second attempt also 401s, return it to the caller — means the
 * session is genuinely expired and the user needs to re-login, not
 * a transient refresh race.
 *
 * Usage: replace `fetch(...)` with `authedFetch(...)` at any client-
 * side call site that hits an auth-required API route. The server-
 * side routes themselves are unchanged.
 *
 * Dev-auth-bypass mode: no Clerk, no 401s in practice. The reload
 * call is guarded with optional-chaining so it's a no-op if
 * window.Clerk isn't present.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (err) {
    // Network errors bubble up unchanged — auth refresh wouldn't help.
    throw err;
  }

  if (response.status !== 401) return response;

  // 401 path: attempt one token refresh + retry.
  try {
    // Clerk attaches itself to window.Clerk in browser environments.
    // The session object has a reload() method that re-validates and
    // refreshes the auth cookie against Clerk's API. We don't await
    // getToken here because Clerk already sets a cookie on reload;
    // subsequent fetches pick it up automatically.
    const w = window as unknown as {
      Clerk?: { session?: { reload?: () => Promise<void> } };
    };
    if (w.Clerk?.session?.reload) {
      await w.Clerk.session.reload();
    }
  } catch {
    // Reload can fail (network issue, session fully expired). In that
    // case we just fall through and let the retry fail too — the caller
    // handles the 401 as before.
  }

  // Retry the original request. If the body was a stream it's already
  // consumed, but our call sites use JSON string bodies which are
  // safe to re-send. If this becomes a constraint we'll accept a
  // body factory fn instead.
  try {
    return await fetch(input, init);
  } catch (err) {
    throw err;
  }
}
