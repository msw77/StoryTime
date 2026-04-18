/**
 * Generate all the icon sizes a PWA needs from a single master image.
 *
 * Sources: public/brand/logo-mark.png (1024x1024)
 * Outputs in public/:
 *   - icon-192.png        → Android/Chrome install icon, standard density
 *   - icon-512.png        → Android/Chrome install icon, high density
 *   - icon-maskable.png   → Android adaptive icon (with safe-zone padding)
 *   - apple-touch-icon.png → iOS home-screen icon (no transparency per
 *                            Apple's spec — Safari flattens PWA icons
 *                            anyway, so we bake a warm cream background
 *                            into the PNG at generation time).
 *
 * Run: node scripts/build-pwa-icons.mjs
 */

import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const SRC = join(ROOT, "public", "brand", "logo-mark.png");
if (!existsSync(SRC)) {
  console.error("Missing source:", SRC);
  process.exit(1);
}

// ── 1. Standard PWA icons (Android + Chrome) ─────────────────────────
// These get transparency — Chrome's OS shell renders them on whatever
// background the user has. Straight resize from the 1024 master.
for (const size of [192, 512]) {
  const outPath = join(ROOT, "public", `icon-${size}.png`);
  await sharp(SRC).resize(size, size, { fit: "contain" }).png().toFile(outPath);
  console.log(`  ✓ ${outPath}`);
}

// ── 2. Maskable icon (Android adaptive) ──────────────────────────────
// Android's adaptive-icon system can crop any PWA icon into a circle,
// squircle, or rounded square depending on the OEM theme. To avoid the
// brand mark getting clipped, maskable icons are authored with a
// "safe zone" — content fits in the inner 80% of the canvas, with
// padding around it. We achieve this by shrinking the mark to 80% of
// the 512 canvas and padding the edges with our brand cream color.
const MASKABLE_SIZE = 512;
const CONTENT_SIZE = Math.round(MASKABLE_SIZE * 0.68); // leaves 16% padding on each side
const pad = Math.round((MASKABLE_SIZE - CONTENT_SIZE) / 2);

const scaledMark = await sharp(SRC)
  .resize(CONTENT_SIZE, CONTENT_SIZE, { fit: "contain", background: { r: 253, g: 248, b: 234 } })
  .toBuffer();

await sharp({
  create: {
    width: MASKABLE_SIZE,
    height: MASKABLE_SIZE,
    channels: 4,
    background: { r: 253, g: 248, b: 234, alpha: 1 }, // brand cream
  },
})
  .composite([{ input: scaledMark, top: pad, left: pad }])
  .png()
  .toFile(join(ROOT, "public", "icon-maskable.png"));
console.log(`  ✓ public/icon-maskable.png (maskable, 16% safe-zone padding)`);

// ── 3. Apple touch icon ──────────────────────────────────────────────
// iOS uses a 180x180 icon for home-screen installs. Apple SILENTLY
// flattens any transparent icon onto the device wallpaper — usually
// producing an ugly mark against a random photo. To prevent this, we
// pre-bake a solid cream background into the PNG. iOS also doesn't do
// adaptive masking, so no safe zone needed — just the mark on solid bg.
const APPLE_SIZE = 180;
const appleScaled = await sharp(SRC)
  .resize(Math.round(APPLE_SIZE * 0.78), Math.round(APPLE_SIZE * 0.78), {
    fit: "contain",
    background: { r: 253, g: 248, b: 234 },
  })
  .toBuffer();
const appleInset = Math.round((APPLE_SIZE - Math.round(APPLE_SIZE * 0.78)) / 2);

await sharp({
  create: {
    width: APPLE_SIZE,
    height: APPLE_SIZE,
    channels: 3, // NO alpha — iOS flattens alpha anyway
    background: { r: 253, g: 248, b: 234 },
  },
})
  .composite([{ input: appleScaled, top: appleInset, left: appleInset }])
  .png()
  .toFile(join(ROOT, "public", "apple-touch-icon.png"));
console.log(`  ✓ public/apple-touch-icon.png (180x180, solid bg)`);

console.log(`\nDone. ${4} icons generated.`);
