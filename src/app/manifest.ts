import type { MetadataRoute } from "next";

/**
 * PWA manifest — tells the browser how to install StoryTime as a
 * standalone app on iOS, Android, and desktop. Served at /manifest.json
 * automatically by Next.js App Router.
 *
 * Key design decisions:
 *
 * - display: "standalone" — launches with no browser chrome. iOS
 *   respects this when the user does "Add to Home Screen"; Android
 *   shows an install prompt in supported browsers.
 *
 * - theme_color + background_color match the app's warm cream palette,
 *   so the OS-drawn title bar / splash screen don't flash white on
 *   launch. Apple in particular shows background_color during the
 *   brief "zoom-from-icon" animation.
 *
 * - orientation: "any" — the reader works fine in portrait or
 *   landscape; locking it would just annoy tablet users.
 *
 * - icons[]: standard 192 + 512 for Android/Chrome install, plus a
 *   "maskable" variant so Android's adaptive-icon system doesn't clip
 *   the brand mark. iOS uses apple-touch-icon.png referenced in
 *   layout.tsx meta tags (not in this manifest — Safari ignores PWA
 *   manifest icon entries).
 *
 * - id: stable identifier so the install becomes an update instead of
 *   a second install if we ever change start_url. Chrome in particular
 *   uses this for dedupe.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StoryTime — Read-Along Stories",
    short_name: "StoryTime",
    description:
      "Read-along stories for kids ages 2–10. Vocabulary, comprehension, and warm narration built on the Science of Reading.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fdf8ea",
    theme_color: "#c25e45",
    categories: ["education", "kids", "books"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
