/**
 * Dev-only auth bypass — single source of truth.
 *
 * The StoryTime reader is tested against Claude's in-browser preview,
 * which sits outside the Clerk redirect domain. To let that preview
 * actually load the app during local development, we support a bypass
 * flag that skips Clerk wholesale: anonymous session, no login gate,
 * service-role Supabase queries fall back to the first user row.
 *
 * Three layers of protection so this can NEVER activate in production:
 *
 *   1. Code-level: requires NODE_ENV === "development". Next.js inlines
 *      this at build time, so a prod bundle literally does not contain
 *      the bypass branch.
 *   2. Env-level: NEXT_PUBLIC_DEV_AUTH_BYPASS must be set to "1". Also
 *      inlined at build time. A Vercel build without this var skips
 *      the branch regardless of NODE_ENV.
 *   3. Runtime hostname guard (client-only): even if somehow both flags
 *      pass, client-side code additionally requires hostname to look
 *      local (localhost, 127.0.0.1, a LAN IP). Stops a misconfigured
 *      staging URL from ever flipping this on.
 *
 * Previous code duplicated the first two checks in 7+ files. Consolidating
 * here so we can't accidentally diverge. Callers import DEV_AUTH_BYPASS.
 */

function isLocalHostname(): boolean {
  if (typeof window === "undefined") return true; // server-side: trust env flags
  const h = window.location.hostname;
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  // RFC1918 LAN-ish hosts parents might use on a dev tablet: 10.*, 192.168.*,
  // 172.16.*-172.31.*. Not an exhaustive CIDR check — just the common cases.
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  return false;
}

/**
 * True if the dev auth bypass is active. Read once at module load and
 * treated as a constant — the env vars are build-time-inlined and the
 * hostname check only matters on the client anyway, so re-evaluating
 * would buy nothing.
 */
export const DEV_AUTH_BYPASS: boolean =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "1" &&
  isLocalHostname();
