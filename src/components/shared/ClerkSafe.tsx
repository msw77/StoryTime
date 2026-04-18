"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  UserButton as RealUserButton,
  SignInButton as RealSignInButton,
} from "@clerk/nextjs";

// ── Clerk-safe wrappers ────────────────────────────────────────────────
// In dev preview auth-bypass mode (NEXT_PUBLIC_DEV_AUTH_BYPASS=1), the
// app renders WITHOUT a <ClerkProvider> in the tree — see layout.tsx.
// The real Clerk components throw when they can't find their provider
// context, so in bypass mode we substitute a no-op placeholder. In
// production (and normal dev), these just forward straight through to
// Clerk.
const DEV_AUTH_BYPASS =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "1";

export function UserButton(props: ComponentProps<typeof RealUserButton>) {
  if (DEV_AUTH_BYPASS) return null;
  return <RealUserButton {...props} />;
}

export function SignInButton({
  children,
  ...props
}: ComponentProps<typeof RealSignInButton> & { children?: ReactNode }) {
  if (DEV_AUTH_BYPASS) return <>{children}</>;
  return <RealSignInButton {...props}>{children}</RealSignInButton>;
}
