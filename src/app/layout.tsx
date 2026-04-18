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
  // PWA / iOS "Add to Home Screen" support. Safari ignores the PWA
  // manifest's icon entries and reads these meta tags directly:
  //   - apple-touch-icon: the 180x180 square iOS uses as the home
  //     screen icon. Generated as a solid-bg PNG by
  //     scripts/build-pwa-icons.mjs so iOS doesn't flatten it against
  //     the user's wallpaper.
  //   - apple-mobile-web-app-capable / -title / -status-bar-style:
  //     tell Safari to launch standalone (no browser chrome), show
  //     "StoryTime" as the task-switcher label, and use a default
  //     status bar that respects our warm cream theme.
  // theme-color is what Android browsers show in the status bar when
  // the PWA is installed. It matches the manifest theme_color.
  applicationName: "StoryTime",
  appleWebApp: {
    capable: true,
    title: "StoryTime",
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

// Next 14+ separates theme-color / viewport out of metadata into a
// dedicated export so the browser can apply them before the page
// renders (avoids a flash of unstyled status bar color on Android).
export const viewport = {
  themeColor: "#c25e45",
  // Important for the reader: disables user-zoom so a two-finger
  // pinch by a toddler doesn't accidentally blow up the text mid-
  // story. `maximum-scale=1` alone trips some a11y tools, so we pair
  // it with viewport-fit=cover for notch-safe iOS rendering.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Dev preview auth bypass — see src/lib/devBypass.ts. When active we
// skip ClerkProvider entirely so the Claude Code preview browser
// (localhost-only) can render the page without Clerk's external
// redirect.
import { DEV_AUTH_BYPASS } from "@/lib/devBypass";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { IOSInstallPrompt } from "@/components/shared/IOSInstallPrompt";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ErrorBoundary wraps the app content so any render crash below it
  // shows a calm fallback instead of unmounting the whole tree. It
  // sits INSIDE <body> and OUTSIDE ClerkProvider so a Clerk error
  // (e.g. missing env var at runtime) also gets caught.
  //
  // IOSInstallPrompt lives AFTER children so its fixed-position
  // banner stacks above the reader but below native modals. It
  // self-hides on non-iOS, on in-app browsers, and after first
  // dismissal — safe to mount globally.
  const html = (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${caveat.variable}`}>
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
        <IOSInstallPrompt />
      </body>
    </html>
  );
  return DEV_AUTH_BYPASS ? html : <ClerkProvider>{html}</ClerkProvider>;
}
