import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
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

export const metadata: Metadata = {
  title: "StoryTime — Children's Read-Along Stories",
  description:
    "Personalized AI-generated stories with narration, word highlighting, and illustrations for kids ages 2-10.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
