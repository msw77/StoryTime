import { z } from "zod";

// ─── Shared zod schemas for /api routes ──────────────────────────────────────
//
// Limits are tuned for children's stories — short pages, small page counts,
// short titles. They exist to bound memory, DB row size, and paid-AI spend,
// not to constrain creativity. Numbers err on the generous side so normal
// users never hit them, but close enough that a scripted abuser can't run
// up $500 in OpenAI/fal charges with one request.
//
// If you need to bump a limit, bump it here — every route reads from this file.

export const LIMITS = {
  // Display / content
  TITLE_MAX: 120,
  EMOJI_MAX: 20, // unicode emoji can be multi-char sequences
  GENRE_MAX: 40,
  AGE_MAX: 10, // e.g. "2-4", "4-7", "8-10"
  COLOR_MAX: 20,

  // Story body
  PAGE_LABEL_MAX: 40,
  PAGE_TEXT_MAX: 2000,
  PAGES_MAX: 25, // hard ceiling on story length
  CHARACTER_DESC_MAX: 1000,

  // Scene descriptions for image generation (fal)
  SCENE_MAX: 800,
  MOOD_MAX: 40,

  // Story generation inputs (anthropic)
  HERO_NAME_MAX: 60,
  HERO_TYPE_MAX: 60,
  OBSTACLE_MAX: 300,
  LESSON_MAX: 200,
  EXTRAS_MAX: 300,
  DURATION_MAX: 10,

  // Child profile
  CHILD_NAME_MAX: 40,
  CHILD_AGE_MIN: 1,
  CHILD_AGE_MAX: 12,

  // TTS
  TTS_TEXT_MAX: 2000,
} as const;

// ─── Primitives used across schemas ──────────────────────────────────────────

// Permissive but bounded: any non-empty trimmed string up to a max length.
// Uses zod's trim() so callers get back already-sanitized strings.
function boundedString(max: number, label = "value") {
  return z.string().trim().min(1, `${label} is required`).max(max, `${label} too long`);
}

function optionalBoundedString(max: number) {
  return z.string().trim().max(max).optional().nullable();
}

// A single story page in the reader's [label, text] tuple format.
// The reader treats page[0] as a chapter label and page[1] as the body.
const pageTuple = z
  .tuple([
    z.string().max(LIMITS.PAGE_LABEL_MAX),
    z.string().min(1).max(LIMITS.PAGE_TEXT_MAX),
  ])
  .describe("page [label, text]");

// Extended page metadata the builder sometimes emits alongside the tuple.
const fullPageSchema = z.object({
  scene: z.string().max(LIMITS.SCENE_MAX).optional(),
  mood: z.string().max(LIMITS.MOOD_MAX).optional(),
  sounds: z.array(z.string().max(40)).max(10).optional(),
});

// Shared optional UUID — used by every endpoint that takes a child profile id.
const childProfileIdSchema = z.string().uuid().optional().nullable();

// ─── /api/stories ────────────────────────────────────────────────────────────

export const saveStorySchema = z.object({
  title: boundedString(LIMITS.TITLE_MAX, "title"),
  emoji: z.string().trim().max(LIMITS.EMOJI_MAX).optional().nullable(),
  genre: boundedString(LIMITS.GENRE_MAX, "genre"),
  age: boundedString(LIMITS.AGE_MAX, "age"),
  pages: z.array(pageTuple).min(1, "pages required").max(LIMITS.PAGES_MAX),
  duration: optionalBoundedString(LIMITS.DURATION_MAX),
  heroName: optionalBoundedString(LIMITS.HERO_NAME_MAX),
  heroType: optionalBoundedString(LIMITS.HERO_TYPE_MAX),
  lesson: optionalBoundedString(LIMITS.LESSON_MAX),
  extras: optionalBoundedString(LIMITS.EXTRAS_MAX),
  childProfileId: childProfileIdSchema,
  fullPages: z.array(fullPageSchema).max(LIMITS.PAGES_MAX).optional().nullable(),
  characterDescription: optionalBoundedString(LIMITS.CHARACTER_DESC_MAX),
  illustrationUrls: z
    .array(z.string().url().nullable())
    .max(LIMITS.PAGES_MAX)
    .optional()
    .nullable(),
});

export type SaveStoryInput = z.infer<typeof saveStorySchema>;

// ─── /api/reading-history ────────────────────────────────────────────────────

export const logReadingSchema = z.object({
  storyId: boundedString(120, "storyId"),
  storyTitle: boundedString(LIMITS.TITLE_MAX, "storyTitle"),
  storyEmoji: optionalBoundedString(LIMITS.EMOJI_MAX),
  storyGenre: boundedString(LIMITS.GENRE_MAX, "storyGenre"),
  storyAge: boundedString(LIMITS.AGE_MAX, "storyAge"),
  storyColor: optionalBoundedString(LIMITS.COLOR_MAX),
  isGenerated: z.boolean().optional(),
  totalPages: z.number().int().min(0).max(LIMITS.PAGES_MAX).optional(),
  childProfileId: childProfileIdSchema,
});

export type LogReadingInput = z.infer<typeof logReadingSchema>;

// ─── /api/generate-story ─────────────────────────────────────────────────────

export const generateStorySchema = z.object({
  heroName: boundedString(LIMITS.HERO_NAME_MAX, "heroName"),
  heroType: optionalBoundedString(LIMITS.HERO_TYPE_MAX),
  genre: boundedString(LIMITS.GENRE_MAX, "genre"),
  age: boundedString(LIMITS.AGE_MAX, "age"),
  obstacle: optionalBoundedString(LIMITS.OBSTACLE_MAX),
  lesson: optionalBoundedString(LIMITS.LESSON_MAX),
  extras: optionalBoundedString(LIMITS.EXTRAS_MAX),
  duration: optionalBoundedString(LIMITS.DURATION_MAX),
});

export type GenerateStoryInput = z.infer<typeof generateStorySchema>;

// ─── /api/generate-images ────────────────────────────────────────────────────

// Hard cap on pages per image-generation request. Each image is a paid fal
// call; a single unbounded request could run up real money. 15 is comfortably
// above the longest story in our current library.
export const IMAGE_PAGES_MAX = 15;

export const generateImagesSchema = z.object({
  pages: z
    .array(
      z.object({
        scene: z.string().trim().min(1).max(LIMITS.SCENE_MAX),
        mood: z.string().trim().max(LIMITS.MOOD_MAX).optional(),
        index: z.number().int().min(0).max(100).optional(),
      }),
    )
    .min(1, "at least one page required")
    .max(IMAGE_PAGES_MAX, `too many pages (max ${IMAGE_PAGES_MAX})`),
  characterDescription: optionalBoundedString(LIMITS.CHARACTER_DESC_MAX),
  heroType: optionalBoundedString(LIMITS.HERO_TYPE_MAX),
});

export type GenerateImagesInput = z.infer<typeof generateImagesSchema>;

// ─── /api/tts ────────────────────────────────────────────────────────────────

export const ttsSchema = z.object({
  text: z.string().trim().min(1, "text is required").max(LIMITS.TTS_TEXT_MAX, "text too long"),
  voice: z
    .enum(["nova", "alloy", "echo", "fable", "onyx", "shimmer"])
    .optional(),
});

export type TtsInput = z.infer<typeof ttsSchema>;

// ─── /api/profiles ───────────────────────────────────────────────────────────

export const createProfileSchema = z.object({
  name: boundedString(LIMITS.CHILD_NAME_MAX, "name"),
  age: z.number().int().min(LIMITS.CHILD_AGE_MIN).max(LIMITS.CHILD_AGE_MAX).optional().nullable(),
  avatar_emoji: z.string().trim().max(LIMITS.EMOJI_MAX).optional().nullable(),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
