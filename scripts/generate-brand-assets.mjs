/**
 * StoryTime — brand asset batch generator
 *
 * Purpose: produce a set of CUSTOM IMAGE PLACEHOLDERS (logo, wordmark,
 * hero illustration, icon set) so we can sanity-check how close our
 * aesthetic is to "premium parent brand" (Coterie / Huckleberry / Nanit
 * / Calm / Yoto) without spending designer money yet.
 *
 * These are NOT final. They are fal.ai nano-banana-2 generations used
 * purely as visual placeholders inside the app, so we can react to
 * "would a Coterie parent actually download this" before investing.
 *
 * Run with:
 *   node scripts/generate-brand-assets.mjs
 *   node scripts/knockout-brand-backgrounds.mjs    ← required second step
 *
 * Output:     public/brand/*.png  (downloaded locally, committed to repo)
 *
 * The script is resumable: anything already in public/brand/ is skipped,
 * so if a run fails partway you just re-run.
 *
 * IMPORTANT: after every generation run, also run the knockout script
 * above. It post-processes the PNGs to replace the solid white / black
 * backgrounds fal produces with true alpha transparency. Without that
 * step, the app will show faint visible rectangles around the wordmark,
 * hero, and action-card icons.
 */

import { fal } from "@fal-ai/client";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── env bootstrap ─────────────────────────────────────────────────
const envPath = join(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const falKey = envContent.match(/FAL_KEY=(.+)/)?.[1]?.trim();
if (!falKey) {
  console.error("FAL_KEY not found in .env.local");
  process.exit(1);
}
fal.config({ credentials: falKey });

// ─── output directory ──────────────────────────────────────────────
const outDir = join(__dirname, "..", "public", "brand");
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
  console.log(`Created ${outDir}`);
}

// ─── shared brand context ──────────────────────────────────────────
// This goes on EVERY prompt so the set feels like one family of images
// instead of ten random generations. Reviewed against our actual palette
// in globals.css.
const BRAND_CONTEXT = `
Brand: StoryTime — a premium read-along app for kids ages 2-10 that
sophisticated parents use (think Coterie, Huckleberry, Nanit, Calm, Yoto).
Must feel editorial and calm, not toy-store loud. Kid-friendly but
aesthetically pleasing to design-literate millennial parents.

Visual reference: mid-century children's picture books (Jon Klassen,
Taro Gomi, Oliver Jeffers, Beatrix Potter). Think "library nook" or
"warmly-lit kindergarten reading corner" — soft textures, paper grain,
tungsten lamplight, not shiny plastic.

Color palette (use these hues, muted not saturated):
- cream paper background (#f9f3e3)
- warm burnt sienna / terracotta accent (#c25e45)
- soft sage green (#7d9b82)
- dusty blue (#6b85a3)
- warm honey highlight (#d4a055)
- deep warm brown text (#2a2722)

AVOID: neon colors, gradients that look digital, purple, bright red,
Crayola brights, 3D plastic look, AI-slop glossy renders, generic
stock illustration, Comic Sans energy.
`.trim();

// ─── the asset list ────────────────────────────────────────────────
// Each entry: what we want, why, and a prompt. The "filename" is what
// it'll be saved as in public/brand/. Size/aspect tuned per use.
const ASSETS = [
  {
    filename: "logo-wordmark.png",
    description: "Main app wordmark — hand-lettered script 'StoryTime'",
    aspect: "16:9",
    prompt: `
${BRAND_CONTEXT}

TASK: Hand-lettered wordmark for the word "StoryTime". IMPORTANT: this
must look HAND-DRAWN with a brush pen or thick marker — not typed, not
a computer font. Loose, warm, slightly imperfect cursive SCRIPT
letterforms connected like a signature, with natural ink-pressure
variation (thicker on down-strokes, thinner on up-strokes). Think a
hand-lettered bakery sign or a vintage children's book cover inscription.
Deep burnt sienna / terracotta color (#a44a33) on a PURE WHITE
(#ffffff) background — absolutely no cream tint, no grain, no texture,
no shadow, no border, no vignette. The background must be uniform
flat white so it can be knocked out via multiply blend. Plenty of
negative space around the letters.

CRITICAL: The text must read EXACTLY "StoryTime" — one word, capital S
and capital T, correct spelling, no typos, no extra letters, no
decoration, no tagline, no icon.
`.trim(),
  },
  {
    filename: "logo-mark.png",
    description: "Icon-only mark for favicons, avatars, app icon",
    aspect: "1:1",
    prompt: `
${BRAND_CONTEXT}

TASK: Design a minimalist icon-only brand mark (NO text, NO letters)
for StoryTime. The mark is a single bold silhouette: a crescent moon
cradling an open book, where the moon curves around the book from
behind like a lamp. Extremely simple geometric shapes — not illustrated,
not detailed, not sketched. Think "corporate colophon" or "Penguin
Books tail" — ONE flat shape in warm burnt sienna (#c25e45) on a
cream (#f9f3e3) background. Must read instantly at 32px. No gradients,
no shading, no textures, no extra elements, no rainbow, no soundwaves,
no stars. Just one confident silhouette.
`.trim(),
  },
  {
    filename: "hero-illustration.png",
    description: "Home screen hero image — sets the emotional tone",
    aspect: "21:9",
    prompt: `
${BRAND_CONTEXT}

TASK: A wide panoramic HAND-DRAWN hero illustration for the top of the
home screen. CRITICAL: This must look obviously HAND-DRAWN — visible
pencil lines, uneven strokes, paper texture, slightly wobbly shapes.
NOT smooth digital illustration, NOT AI-slop, NOT realistic rendering.
Think a page from a children's picture book sketchbook — pen-and-ink
line work with loose watercolor wash on top, messy imperfect edges,
hatching for shadow, visible brushmarks. Reference: Jon Klassen, Oliver
Jeffers, Quentin Blake, Jean-Jacques Sempé, Mary Blair rough concepts.

Scene composition for a very wide landscape canvas: on the left a cozy
window nook with a parent and small child curled together reading a
picture book under a warm lamp; in the middle a stack of books on a
side table and a sleeping ginger cat; on the right a bookshelf with
toys and a jar of crayons; golden afternoon light across the whole
scene. Calm, intimate, low-energy. PURE WHITE (#ffffff) background
around the illustration — absolutely no cream tint, no paper texture
behind the illustration, no colored border or vignette. The white
must be uniform so it can be knocked out via multiply blend against
the app's cream page background. Limited muted palette from the brand
colors above (terracotta, sage, dusty blue, honey, warm brown) INSIDE
the illustration only. NO text, NO logos, NO UI elements, NO digital
gradients.
`.trim(),
  },
  {
    filename: "empty-library.png",
    description: "Empty state for a kid's library with no stories yet",
    aspect: "4:3",
    prompt: `
${BRAND_CONTEXT}

TASK: Empty-state illustration shown when a child profile has no saved
stories yet. Scene: a single empty bookshelf in a sunny corner, a cat
curled up on the bottom shelf, dust motes in a sunbeam, one stray book
open on the floor. Gentle, not sad. Communicates "your library is
waiting to be filled". Style: soft watercolor wash, warm muted palette
from the brand colors, Beatrix Potter meets Taro Gomi. NO text,
NO characters, NO UI.
`.trim(),
  },
  // Icon treatment note: these three are generated as CREAM GLYPHS on
  // PURE BLACK backgrounds. The app uses mix-blend-mode: screen to knock
  // the black out against any colored card — screen brightens every pixel,
  // so black disappears into the card and the cream glyph stays bright.
  // This is why the backgrounds are pure black instead of the brand
  // colors. Do not "fix" this by asking for colored backgrounds — it
  // will re-introduce the visible nested box the user hated.
  // Shared anti-container instruction — fal models LOVE generating
  // iOS-style app tiles (rounded square with the glyph inside), which
  // leaves a visible rectangular halo after black knockout. This block
  // is appended to every icon prompt to kill that behavior.
  // (Defined here because JS const hoisting won't reach below; we
  // inline it via template string in each prompt instead.)

  {
    filename: "icon-create.png",
    description: "Create-a-story tile icon — magic wand, hand-drawn",
    aspect: "1:1",
    prompt: `
${BRAND_CONTEXT}

TASK: A HAND-DRAWN icon of a magic wand — a thin tapering stick with
a five-point star at the tip, and 3-4 small sparkles floating around
the star like pixie dust. Classic fairy-tale wand. Represents
"create / cast a new story". Whimsical and magical.

CRITICAL STYLE REQUIREMENTS — must look like it was drawn by hand in
a sketchbook with a brush pen:
- Visible rough pencil or ink lines, NOT clean vector shapes
- Wobbly, imperfect edges with hand tremor
- Uneven stroke width, slightly crooked star and stick
- Loose sketchy crosshatching or dots for texture on the star
- Looks like a child's storybook illustration, not a corporate app icon

ABSOLUTELY FORBIDDEN: rounded square frame, icon tile, app icon
container, squircle background, border, vignette, drop shadow,
decorative corner, any rectangular or square shape framing the
content. The glyph must float freely on the pure black canvas with
NOTHING around it. No book, no pages, no smoke, no wisps, no smoke
trail — just a wand and sparkles.

All shapes in cream/off-white color (#f9f3e3) on a PURE FLAT BLACK
(#000000) background — absolutely uniform flat black, no gradient,
no darker shape inside, no rounded square container. Centered
composition, plenty of negative space. No text, no letters. Must
still read at 32px. Reference: Quentin Blake ink sketches.
`.trim(),
  },
  {
    filename: "icon-library.png",
    description: "My Stories tile icon — hand-drawn stack of books",
    aspect: "1:1",
    prompt: `
${BRAND_CONTEXT}

TASK: A HAND-DRAWN icon of a cozy stack of 2-3 picture books piled on
top of each other, seen from the side so you see the spines. A small
bookmark ribbon peeking out from the top book. Feels like a child's
personal library.

CRITICAL STYLE REQUIREMENTS — must look like it was drawn by hand in
a sketchbook with a brush pen:
- Visible rough pencil or ink lines, NOT clean vector shapes
- Wobbly, imperfect edges with hand tremor
- Uneven stroke width, books slightly crooked and stacked imperfectly
- Loose sketchy crosshatching for shading on the spines
- Looks like a child's storybook illustration, not a corporate app icon

ABSOLUTELY FORBIDDEN: rounded square frame, icon tile, app icon
container, squircle background, border, vignette, drop shadow,
decorative corner, any rectangular or square shape framing the
content. The glyph must float freely on the pure black canvas with
NOTHING around it.

All shapes in cream/off-white color (#f9f3e3) on a PURE FLAT BLACK
(#000000) background — absolutely uniform flat black, no gradient,
no darker shape inside, no rounded square container. Centered
composition, plenty of negative space. No text, no titles, no letters
on the books. Reference: Quentin Blake ink sketches.
`.trim(),
  },
  {
    filename: "icon-history.png",
    description: "Recently Read tile icon — hand-drawn clock",
    aspect: "1:1",
    prompt: `
${BRAND_CONTEXT}

TASK: A HAND-DRAWN icon of a round analog wall clock showing hands at
roughly 10:10. Simple clock face, just hands and a few tick marks —
no numbers.

CRITICAL STYLE REQUIREMENTS — must look like it was drawn by hand in
a sketchbook with a brush pen:
- Visible rough pencil or ink lines, NOT clean vector shapes
- Wobbly, imperfect circle with hand tremor
- Uneven stroke width, slightly crooked hands and tick marks
- Loose sketchy feel — like it was doodled quickly, not precision-drawn
- Looks like a child's storybook illustration, not a corporate app icon

ABSOLUTELY FORBIDDEN: rounded square frame, icon tile, app icon
container, squircle background, border, vignette, drop shadow,
decorative corner, any rectangular or square shape framing the
content. The clock must float freely on the pure black canvas with
NOTHING around it.

All shapes in cream/off-white color (#f9f3e3) on a PURE FLAT BLACK
(#000000) background — absolutely uniform flat black, no gradient,
no darker shape inside, no rounded square container. Centered
composition, plenty of negative space. No text, no numbers, no letters.
Reference: Quentin Blake ink sketches.
`.trim(),
  },
  {
    filename: "genre-adventure.png",
    description: "Adventure genre tile art (replaces 🗺️)",
    aspect: "1:1",
    prompt: `
${BRAND_CONTEXT}

TASK: A small square illustration that represents the ADVENTURE genre
for a library filter tile. A rolled map with a compass on it, OR a
hiking boot and a walking stick, OR a mountain range at dawn. Warm
terracotta palette, textured brushwork, Jon Klassen flatness.
No text. Simple enough to read at 56px.
`.trim(),
  },
  {
    filename: "genre-fantasy.png",
    description: "Fantasy genre tile art (replaces 🧙)",
    aspect: "1:1",
    prompt: `
${BRAND_CONTEXT}

TASK: A small square illustration for the FANTASY genre tile. A castle
turret with a star above it, OR a single wizard's hat with stars
around it, OR a small dragon curled around a book. Dusty lavender
and cream palette, textured brushwork, Jon Klassen flatness.
No text. Readable at 56px.
`.trim(),
  },
  {
    filename: "genre-animals.png",
    description: "Animals genre tile art (replaces 🐾)",
    aspect: "1:1",
    prompt: `
${BRAND_CONTEXT}

TASK: A small square illustration for the ANIMALS genre tile. A sleeping
fox curled up, OR a rabbit peeking out of grass, OR a bear holding a
honey jar. Warm clay palette, textured brushwork, Taro Gomi flatness.
No text. Readable at 56px.
`.trim(),
  },
];

// ─── fal.ai call ───────────────────────────────────────────────────
// nano-banana-2 has the softest, most painterly look — perfect for
// brand/editorial work where imagen4 would feel too "clean AI". If
// the budget-conscious fast model is preferred later, swap model id.
async function generateOne(asset) {
  console.log(`\n→ ${asset.filename}`);
  console.log(`  ${asset.description}`);

  const result = await fal.subscribe("fal-ai/nano-banana-2", {
    input: {
      prompt: asset.prompt,
      aspect_ratio: asset.aspect,
      num_images: 1,
      output_format: "png",
    },
  });

  const data = result.data;
  if (!data?.images?.length) {
    throw new Error(`No image returned for ${asset.filename}`);
  }
  return data.images[0].url;
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
}

// ─── main loop ─────────────────────────────────────────────────────
async function main() {
  console.log(`Generating ${ASSETS.length} brand asset placeholders → ${outDir}`);
  console.log("These are PLACEHOLDERS, not final art.\n");

  let made = 0;
  let skipped = 0;
  let failed = 0;

  for (const asset of ASSETS) {
    const dest = join(outDir, asset.filename);
    if (existsSync(dest)) {
      console.log(`✓ skip  ${asset.filename} (already exists — delete to regenerate)`);
      skipped++;
      continue;
    }
    try {
      const url = await generateOne(asset);
      await downloadTo(url, dest);
      console.log(`✓ saved ${asset.filename}`);
      made++;
    } catch (err) {
      console.error(`✗ FAIL  ${asset.filename}:`, err.message || err);
      failed++;
    }
  }

  console.log(`\nDone. made=${made} skipped=${skipped} failed=${failed}`);
  console.log(`\nFiles are in public/brand/. You can reference them in CSS as url("/brand/logo-wordmark.png")`);
  console.log(`To regenerate any single asset, delete its file and re-run this script.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
