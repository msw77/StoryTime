import { Genre, AgeGroup, Duration } from "@/types/story";

// Genre colors are deliberately muted — think Coterie/Huckleberry, not
// Crayola. Each hue is distinct enough to tell the genres apart at a
// glance but none of them shout, so the library view reads as a calm
// editorial grid rather than a toy-store wall. Same hue family as the
// brand accents (warm terracotta + sage) so everything feels related.
export const GENRES: Genre[] = [
  { id: "all", label: "All Genres", emoji: "📖", color: "#8a8170" },         // stone
  { id: "classics", label: "Classics", emoji: "📖", color: "#b8860b" },      // dark goldenrod
  { id: "adventure", label: "Adventure", emoji: "🗺️", color: "#b55a3c" },   // terracotta
  { id: "fantasy", label: "Fantasy", emoji: "🧙", color: "#9584ad" },        // dusty lavender
  { id: "friendship", label: "Friendship", emoji: "🤝", color: "#d4a055" }, // warm honey
  { id: "silly", label: "Silly", emoji: "🤪", color: "#8ba478" },            // soft sage
  { id: "discovery", label: "Discovery", emoji: "🌍", color: "#6fa39a" },    // muted teal
  { id: "animals", label: "Animals", emoji: "🐾", color: "#c58a5a" },        // clay
  { id: "sports", label: "Sports", emoji: "⚽", color: "#7a9e8f" },          // eucalyptus
  // "random" is builder-only — not a real genre; resolved to a random real
  // genre in BuilderScreen before sending to the API. Kept in GENRES so the
  // color lookup at save time still finds something sensible.
  { id: "random", label: "Surprise Me!", emoji: "🎲", color: "#8a8170" },    // stone
];

export const AGE_GROUPS: AgeGroup[] = [
  { id: "2-4", label: "🌱 Ages 2–4" },
  { id: "4-7", label: "⭐ Ages 4–7" },
  { id: "7-10", label: "📚 Ages 7–10" },
];

// Builder screen shows every genre except the "all" library filter and
// "classics" (classics are curated built-in stories, not a builder option).
export const BUILDER_GENRES = GENRES.filter((g) => g.id !== "all" && g.id !== "classics");
// Real genres (exclude synthetic "random" and curated "classics") for randomization.
export const REAL_GENRES = BUILDER_GENRES.filter((g) => g.id !== "random");

export const LESSONS = [
  "Be brave",
  "Be kind",
  "Work together",
  "Never give up",
  "Be honest",
  "Share with others",
  "Believe in yourself",
  "Try new things",
  "Be a good friend",
  "Respect nature",
  "Write my own…",
];

export const HERO_TYPES = [
  "👧 Girl",
  "👦 Boy",
  "🐱 Cat",
  "🐶 Dog",
  "🐰 Bunny",
  "🦄 Unicorn",
  "🐻 Bear",
  "🤖 Robot",
  "🧚 Fairy",
  "🐉 Dragon",
  "✏️ Other…",
];

export const DURATIONS: Duration[] = [
  { id: "3", label: "🌙 Quick", desc: "~3 min", minutes: 3, targetWords: 400 },
  { id: "5", label: "⭐ Short", desc: "~5 min", minutes: 5, targetWords: 650 },
  { id: "10", label: "📖 Medium", desc: "~10 min", minutes: 10, targetWords: 1300 },
  { id: "15", label: "🌟 Long", desc: "~15 min", minutes: 15, targetWords: 1950 },
];
