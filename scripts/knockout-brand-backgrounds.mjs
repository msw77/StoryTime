/**
 * Brand asset background knockout.
 *
 * fal.ai image models (nano-banana-2, imagen4, etc.) produce PNGs with
 * solid backgrounds — either near-white or near-black — instead of true
 * alpha transparency. We've tried CSS blend modes (multiply / screen /
 * lighten), but they're fooled by anti-aliased edge pixels that aren't
 * exactly 255/255/255 or 0/0/0, leaving a faint visible rectangle.
 *
 * Proper fix: post-process the PNGs with sharp and replace near-white
 * or near-black pixels with alpha=0, with a smooth falloff across the
 * threshold band so anti-aliased edges blend cleanly. After this the
 * PNGs are genuinely transparent and the app can drop all the
 * blend-mode CSS hacks.
 *
 * Run with:   node scripts/knockout-brand-backgrounds.mjs
 * Input:      existing PNGs in public/brand/
 * Output:     same files, overwritten with transparent backgrounds
 *
 * This script makes NO API calls — it just processes files already on
 * disk. Safe to re-run.
 */

import sharp from "sharp";
import { readdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const brandDir = join(__dirname, "..", "public", "brand");

// ─── asset → knockout mode mapping ─────────────────────────────────
// "white" = pixels near (255,255,255) become transparent — for assets
//           generated on a white background (wordmark, hero).
// "black" = pixels near (0,0,0) become transparent — for assets
//           generated on a black background (action-card icons).
// "skip"  = leave alone — for assets that already use colored or cream
//           backgrounds matching their on-page context (favicon,
//           empty-state illustration, genre tiles).
const KNOCKOUT = {
  "logo-wordmark.png": "white",
  "hero-illustration.png": "white",
  "icon-create.png": "black",
  "icon-library.png": "black",
  "icon-history.png": "black",
  "logo-mark.png": "skip",
  "empty-library.png": "skip",
  "genre-adventure.png": "skip",
  "genre-fantasy.png": "skip",
  "genre-animals.png": "skip",
};

// Thresholds for the falloff band. Pixels brighter than `hardThreshold`
// become fully transparent; pixels darker than `softThreshold` stay
// fully opaque; pixels in between get a proportional alpha. This gives
// clean anti-aliased edges instead of jagged hard cutouts.
const WHITE_HARD = 248; // brightness above this → fully transparent
const WHITE_SOFT = 200; // brightness below this → fully opaque
// Blacks are trickier: fal tends to generate "black" tile backgrounds
// as a slightly lighter rounded-square container (because the model
// has seen a million iOS app icons), which survives pure-black knockout
// as a visible halo. Pushing BLACK_HARD up to 40 drops the near-black
// squircle into full transparency. BLACK_SOFT at 95 keeps the wide
// soft falloff so anti-aliased edges on the glyph stay smooth.
const BLACK_HARD = 40;
const BLACK_SOFT = 95;

async function knockout(filePath, mode) {
  if (mode === "skip") {
    console.log(`  skip  ${filePath.split(/[/\\]/).pop()}`);
    return;
  }

  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data); // mutable copy
  const totalPixels = info.width * info.height;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const brightness = (r + g + b) / 3;

    if (mode === "white") {
      if (brightness >= WHITE_HARD) {
        pixels[offset + 3] = 0;
      } else if (brightness > WHITE_SOFT) {
        // Linear falloff from opaque (at WHITE_SOFT) to transparent
        // (at WHITE_HARD). Pre-multiplied alpha isn't needed here
        // because we're just adjusting alpha, not RGB.
        const t = (brightness - WHITE_SOFT) / (WHITE_HARD - WHITE_SOFT);
        pixels[offset + 3] = Math.round(255 * (1 - t));
      }
    } else if (mode === "black") {
      if (brightness <= BLACK_HARD) {
        pixels[offset + 3] = 0;
      } else if (brightness < BLACK_SOFT) {
        const t = (brightness - BLACK_HARD) / (BLACK_SOFT - BLACK_HARD);
        pixels[offset + 3] = Math.round(255 * t);
      }
    }
  }

  // After knockout, auto-trim the transparent border so the remaining
  // glyph/illustration fills the full image rect. Without this, the
  // icons render with invisible padding around them and the visible
  // content sits inside empty space — which looks like a pasted-on
  // sticker rather than a drawing that fills the card. Trim threshold
  // is 1 (alpha > 0) so we keep everything that's not fully transparent.
  await sharp(pixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .trim({ threshold: 1 })
    .toFile(filePath + ".tmp");

  // Swap the temp file over the original. Can't overwrite in place
  // because sharp is reading the same file we're writing.
  const fs = await import("fs");
  fs.renameSync(filePath + ".tmp", filePath);

  console.log(`  knocked ${mode.padEnd(5)} ${filePath.split(/[/\\]/).pop()}`);
}

async function main() {
  if (!existsSync(brandDir)) {
    console.error(`Brand directory not found: ${brandDir}`);
    process.exit(1);
  }

  console.log(`Knocking out backgrounds in ${brandDir}\n`);

  const files = readdirSync(brandDir).filter((f) => f.endsWith(".png"));

  for (const file of files) {
    const mode = KNOCKOUT[file];
    if (!mode) {
      console.log(`  ??    ${file} (no rule; leaving alone)`);
      continue;
    }
    try {
      await knockout(join(brandDir, file), mode);
    } catch (err) {
      console.error(`  FAIL  ${file}: ${err.message || err}`);
    }
  }

  console.log("\nDone. PNGs now have true alpha transparency.");
  console.log("You can remove all mix-blend-mode CSS rules for these images.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
