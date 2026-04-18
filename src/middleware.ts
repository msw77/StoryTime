import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Dev preview auth bypass — when NEXT_PUBLIC_DEV_AUTH_BYPASS=1 is set
// in dev, middleware is a no-op: no Clerk calls, no auth protection.
// Lets the Claude Code preview browser load localhost pages without
// any redirect to clerk.accounts.dev (which the preview tool blocks).
// NODE_ENV gate ensures prod builds never take this path even if the
// env var somehow leaks into deployment.
const DEV_AUTH_BYPASS =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "1";

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/api/(.*)",
]);

const realMiddleware = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export default DEV_AUTH_BYPASS
  ? () => NextResponse.next()
  : realMiddleware;

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
