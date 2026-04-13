import { Genre, AgeGroup, Duration } from "@/types/story";

export const GENRES: Genre[] = [
  { id: "all", label: "All", emoji: "📖", color: "#6366f1" },
  { id: "adventure", label: "Adventure", emoji: "🗺️", color: "#ef4444" },
  { id: "fantasy", label: "Fantasy", emoji: "🧙", color: "#a855f7" },
  { id: "friendship", label: "Friendship", emoji: "🤝", color: "#f59e0b" },
  { id: "silly", label: "Silly", emoji: "🤪", color: "#22c55e" },
  { id: "mystery", label: "Mystery", emoji: "🔍", color: "#6366f1" },
  { id: "science", label: "Science", emoji: "🔬", color: "#06b6d4" },
  { id: "animals", label: "Animals", emoji: "🐾", color: "#f97316" },
  { id: "sports", label: "Sports", emoji: "⚽", color: "#14b8a6" },
  { id: "history", label: "History", emoji: "🏛️", color: "#92400e" },
];

export const AGE_GROUPS: AgeGroup[] = [
  { id: "2-4", label: "🌱 Ages 2–4" },
  { id: "4-7", label: "⭐ Ages 4–7" },
  { id: "7-10", label: "📚 Ages 7–10" },
];

export const BUILDER_GENRES = GENRES.filter((g) => g.id !== "all");

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
];

export const DURATIONS: Duration[] = [
  { id: "3", label: "🌙 Quick", desc: "~3 min", minutes: 3, targetWords: 400 },
  { id: "5", label: "⭐ Short", desc: "~5 min", minutes: 5, targetWords: 650 },
  { id: "10", label: "📖 Medium", desc: "~10 min", minutes: 10, targetWords: 1300 },
  { id: "15", label: "🌟 Long", desc: "~15 min", minutes: 15, targetWords: 1950 },
  { id: "20", label: "👑 Epic", desc: "~20 min", minutes: 20, targetWords: 2600 },
];
