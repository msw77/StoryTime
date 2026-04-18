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

// Dev preview auth bypass. When NEXT_PUBLIC_DEV_AUTH_BYPASS=1 is set in
// dev, we skip ClerkProvider entirely — no Clerk client script loads,
// no network call to clerk.accounts.dev — so the Claude Code preview
// browser (which blocks all non-localhost URLs) can render the page.
// Gated by NODE_ENV to make absolutely sure this never ships to prod.
const DEV_AUTH_BYPASS =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const html = (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
  return DEV_AUTH_BYPASS ? html : <ClerkProvider>{html}</ClerkProvider>;
}
