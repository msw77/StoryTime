/**
 * .mjs mirror of src/lib/textNormalization.ts — same logic, importable
 * from batch-generation scripts. See the TS file for background.
 *
 * Batch scripts call normalizeStoryPages(pages) after Claude returns so
 * any digit/em-dash/hyphen pattern that slipped past the prompt rules
 * gets cleaned before the story is written to disk or handed to TTS.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberToWords(n) {
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
    return rest === 0 ? `${ONES[h]} hundred` : `${ONES[h]} hundred ${numberToWords(rest)}`;
  }
  // Year-style for 1000-2099 (historical + near-future); "four thousand five
  // hundred" style for everything else up to 9999.
  if (n >= 1000 && n <= 2099) {
    const hi = Math.floor(n / 100);
    const lo = n % 100;
    if (lo === 0) return `${numberToWords(hi)} hundred`;
    if (lo < 10) return `${numberToWords(hi)} oh ${ONES[lo]}`;
    return `${numberToWords(hi)} ${numberToWords(lo)}`;
  }
  if (n < 10000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    return rest === 0 ? `${ONES[thousands]} thousand` : `${ONES[thousands]} thousand ${numberToWords(rest)}`;
  }
  return String(n);
}

export function rewriteDigitsAsWords(text) {
  return text.replace(/\b(\d{1,4})\b/g, (match) => {
    const n = Number(match);
    const words = numberToWords(n);
    return words === match ? match : words;
  });
}

export function normalizeDashes(text) {
  return text.replace(/\s*[\u2013\u2014]\s*/g, ", ").replace(/[\u2013\u2014]/g, ",");
}

export function normalizeQuotes(text) {
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/\u2026/g, "...");
}

export function normalizeHyphens(text) {
  // Match the whole lowercase-hyphenated compound (e.g. "ten-year-old")
  // and replace every hyphen with a space. The previous approach used
  // a repeating capture group, which in JS only keeps the LAST match —
  // so "ten-year-old" became "ten old" (losing "year"). This simpler
  // regex on the entire matched run is correct.
  return text.replace(/\b[a-z]+(?:-[a-z]+)+\b/g, (m) => m.replace(/-/g, " "));
}

export function normalizeStoryText(text) {
  let t = text;
  t = normalizeDashes(t);
  t = normalizeHyphens(t);
  t = rewriteDigitsAsWords(t);
  t = normalizeQuotes(t);
  t = t.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n");
  return t.trim();
}

/**
 * Normalize in place for the classic-stories shape: pages is an array of
 * [label, text] tuples. Mutates the array elements' text portion.
 */
export function normalizePagesArrayOfTuples(pages) {
  for (let i = 0; i < pages.length; i++) {
    if (Array.isArray(pages[i]) && pages[i].length >= 2) {
      pages[i][1] = normalizeStoryText(pages[i][1]);
    }
  }
}

/**
 * Normalize in place for the builtin/history-stories shape: pages is
 * an array of { text, ... } objects.
 */
export function normalizePagesArrayOfObjects(pages) {
  for (let i = 0; i < pages.length; i++) {
    if (pages[i] && typeof pages[i].text === "string") {
      pages[i].text = normalizeStoryText(pages[i].text);
    }
  }
}
