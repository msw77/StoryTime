import type { Metadata } from "next";
import { Inter, Fraunces, Caveat } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Body typeface: Inter. A humanist sans that reads as editorial/magazine
// rather than "prototype kids app". Same category premium parent apps
// like Coterie, Huckleberry, and Calm use. The CSS variable name is
// "--font-nunito" for historical reasons — renaming it would ripple
// through every component style, so we kept the variable and swapped
// what it points at.
const inter = Inter({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Display typeface: Fraunces. A warm, modern serif with real editorial
// weight. Paired with Inter it gives the app a Coterie/Huckleberry feel
// where the headline type carries most of the "premium" signal. Variable
// font so we get full weight and optical-size control without a penalty.
const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal"],
});

// Handwriting typeface: Caveat. Used ONLY by the word-fx-handwritten
// effect to render quoted notes, letters, and signs inside stories as
// if they're physical handwritten objects the character is reading.
// Loaded once here so the font swap is instant when the moment fires.
const caveat = Caveat({
  variable: "--font-handwritten",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "StoryTime — Children's Read-Along Stories",
  description:
    "Personalized AI-generated stories with narration, word highlighting, and illustrations for kids ages 2-10.",
};

// Dev preview auth bypass — see src/lib/devBypass.ts. When active we
// skip ClerkProvider entirely so the Claude Code preview browser
// (localhost-only) can render the page without Clerk's external
// redirect.
import { DEV_AUTH_BYPASS } from "@/lib/devBypass";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ErrorBoundary wraps the app content so any render crash below it
  // shows a calm fallback instead of unmounting the whole tree. It
  // sits INSIDE <body> and OUTSIDE ClerkProvider so a Clerk error
  // (e.g. missing env var at runtime) also gets caught. See
  // src/components/shared/ErrorBoundary.tsx for rationale.
  const html = (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${caveat.variable}`}>
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
  return DEV_AUTH_BYPASS ? html : <ClerkProvider>{html}</ClerkProvider>;
}
