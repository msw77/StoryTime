/**
 * Story-text normalization for Whisper-alignment friendliness.
 *
 * Background: the word-highlight reconciler depends on Whisper's token
 * stream matching our whitespace-split display words character-for-
 * character. Two patterns blow this up:
 *   - Digit numbers ("11") — TTS says "eleven", Whisper transcribes
 *     "eleven", but display still shows "11" → orphaned highlight.
 *   - Em/en-dashes ("—", "–") — TTS swallows them silently, Whisper
 *     returns no token, but display keeps them as their own word.
 *   - Curly quotes (' ' " ") — differ from Whisper's ASCII output, so
 *     char-offset alignment drifts.
 *
 * Phase 1a fixed the symptom (orphan words now get interpolated times
 * so the highlight never skips). This normalizer fixes the cause by
 * rewriting the story text BEFORE it's saved, so what the kid reads
 * matches what TTS says which matches what Whisper transcribes.
 *
 * The normalizer runs at two points:
 *   1. Right after Claude returns a new custom story (src/lib/anthropic.ts)
 *   2. At the top of batch-generation scripts for the library corpus
 *
 * Claude is ALSO told to write numbers as words and avoid em-dashes in
 * its system prompt (see the story prompt in anthropic.ts / each
 * batch script) — this is belt-and-suspenders for cases where the model
 * slips up, which in practice it sometimes does.
 */

// ── Digit → word conversion ──────────────────────────────────────────
const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

/**
 * Convert an integer 0–9999 into the way TTS will pronounce it.
 * Years (1000–2099) get the "nineteen sixty-nine" shape; generic 4-digit
 * numbers get the "four thousand five hundred" shape. Outside the
 * supported range we fall back to the digit string unchanged — rare
 * enough in children's stories that it's not worth the complexity.
 */
export function numberToWords(n: number): string {
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return rest === 0
      ? `${ONES[h]} hundred`
      : `${ONES[h]} hundred ${numberToWords(rest)}`;
  }
  // Year-style parsing for 1000–2099 — the only 4-digit numbers that
  // appear in a meaningful way in our corpus (historical dates, near-
  // future sci-fi years). TTS consistently says these as two two-digit
  // chunks ("nineteen sixty-nine", "twenty twenty-four").
  if (n >= 1000 && n <= 2099) {
    const hi = Math.floor(n / 100);
    const lo = n % 100;
    if (lo === 0) return `${numberToWords(hi)} hundred`;
    if (lo < 10) return `${numberToWords(hi)} oh ${ONES[lo]}`;
    return `${numberToWords(hi)} ${numberToWords(lo)}`;
  }
  // Generic thousands (up to 9999). Say "four thousand five hundred".
  if (n < 10000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    return rest === 0
      ? `${ONES[thousands]} thousand`
      : `${ONES[thousands]} thousand ${numberToWords(rest)}`;
  }
  return String(n);
}

/**
 * Find bare integer tokens and rewrite them as their word form. We only
 * match whole-word integers so we don't butcher things like "store42" or
 * a URL that happens to sneak through. Ordinals ("1st", "2nd") are left
 * alone for now — rare in read-along text, but the reconciler's
 * interpolation handles them gracefully if they appear.
 */
export function rewriteDigitsAsWords(text: string): string {
  return text.replace(/\b(\d{1,4})\b/g, (match) => {
    const n = Number(match);
    const words = numberToWords(n);
    // If conversion fell back to digits (out of range), keep original.
    return words === match ? match : words;
  });
}

// ── Dash normalization ──────────────────────────────────────────────
/**
 * Em-dash (U+2014) and en-dash (U+2013) are silent in TTS and become
 * orphan display words in the reconciler. Replace with ", " which TTS
 * voices naturally as a beat, and which matches the punctuation our
 * char-cleaner already strips. Space-surrounded dashes collapse into a
 * single comma-space; standalone dashes become a comma-space too.
 */
export function normalizeDashes(text: string): string {
  return text
    // Space-surrounded em/en dash → ", "
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    // Any stragglers (no surrounding whitespace) → comma
    .replace(/[\u2013\u2014]/g, ",");
}

// ── Quote normalization ─────────────────────────────────────────────
/**
 * Curly quotes differ character-by-character from straight ASCII in
 * Whisper's transcription output. Replacing them with straight ASCII
 * versions keeps char-offset alignment clean.
 */
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    // Triple dots → three periods (TTS handles both but Whisper sometimes
    // splits differently)
    .replace(/\u2026/g, "...");
}

// ── Hyphenated-compound handling ─────────────────────────────────────
/**
 * Hyphens inside letter-letter compounds ("ten-year-old", "well-known")
 * collapse three display words into Whisper's ~3 separate tokens,
 * producing pileups. Rewriting with spaces lets both sides match.
 *
 * Carve-outs:
 *   - Keep hyphens in proper nouns where casing indicates intent
 *     (e.g. "Stratford-upon-Avon", "R2-Friend") — these are specific
 *     names and rewriting them would feel wrong. We detect this by
 *     requiring the compound to be all-lowercase letters on both sides
 *     of the hyphen.
 *   - Keep numeric compounds like "chapter-3" (already a digit which
 *     we handle separately).
 */
export function normalizeHyphens(text: string): string {
  // Match the whole lowercase-hyphenated compound (e.g. "ten-year-old")
  // and replace every hyphen with a space. The earlier approach used a
  // repeating capture group, which in JS only keeps the LAST match, so
  // "ten-year-old" became "ten old" (losing "year").
  return text.replace(/\b[a-z]+(?:-[a-z]+)+\b/g, (m) => m.replace(/-/g, " "));
}

// ── Combined entry point ────────────────────────────────────────────
/**
 * Apply every normalization step to a single body of story text.
 * Order matters: dashes first (so we don't confuse the hyphen rule),
 * then hyphens, then digits (so "2-year-old" becomes "two year old"
 * rather than "2 year old" after hyphen pass), then quotes last.
 */
export function normalizeStoryText(text: string): string {
  let t = text;
  t = normalizeDashes(t);
  t = normalizeHyphens(t);
  t = rewriteDigitsAsWords(t);
  t = normalizeQuotes(t);
  // Collapse any runs of whitespace the replacements left behind.
  t = t.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n");
  return t.trim();
}

// ── Deep-normalize a full GeneratedStory object ─────────────────────
/**
 * Applies normalizeStoryText() to every page's `text` field and leaves
 * `scene`, `sounds`, `chapterTitle`, etc. alone — those aren't displayed
 * during playback and keeping them as-authored preserves intent for
 * illustrations and audio direction.
 *
 * Title emoji and non-page fields are unchanged. Returns a new object;
 * the input is not mutated.
 */
export function normalizeGeneratedStory<
  T extends { pages: Array<{ text: string }> }
>(story: T): T {
  return {
    ...story,
    pages: story.pages.map((p) => ({
      ...p,
      text: normalizeStoryText(p.text),
    })),
  };
}
