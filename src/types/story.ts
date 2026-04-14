export interface StoryPage {
  scene?: string;
  mood?: string;
  sounds?: string[];
}

/** A single word's timing within a page's audio, from OpenAI Whisper */
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface Story {
  id: string;
  title: string;
  emoji: string;
  color: string;
  genre: string;
  age: string;
  pages: [string, string][];
  fullPages?: StoryPage[];
  generated?: boolean;
  duration?: string;
  characterDescription?: string;
  /** Pre-loaded image URLs (indexed by page number, null = not yet loaded) */
  preloadedImages?: (string | null)[];
  /** Persisted mp3 URLs from Supabase Storage, indexed by page number.
   *  Null entries fall back to on-demand /api/tts generation. */
  audioUrls?: (string | null)[];
  /** Persisted Whisper word timings, indexed by page number. */
  wordTimings?: (WordTiming[] | null)[];
}

export interface Genre {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

export interface AgeGroup {
  id: string;
  label: string;
}

export interface Duration {
  id: string;
  label: string;
  desc: string;
  minutes: number;
  targetWords: number;
}

export interface Sentence {
  text: string;
  startIdx: number;
  endIdx: number;
}

// AI voice options from OpenAI TTS
export type AIVoiceName = "nova" | "alloy" | "echo" | "fable" | "onyx" | "shimmer";

export interface AIVoiceOption {
  id: AIVoiceName;
  label: string;
  desc: string;
}

export const AI_VOICES: AIVoiceOption[] = [
  { id: "nova", label: "Nova", desc: "Warm & friendly (recommended)" },
  { id: "shimmer", label: "Shimmer", desc: "Gentle & expressive" },
  { id: "fable", label: "Fable", desc: "Storyteller style" },
  { id: "alloy", label: "Alloy", desc: "Balanced & clear" },
  { id: "echo", label: "Echo", desc: "Calm & soothing" },
  { id: "onyx", label: "Onyx", desc: "Deep & resonant" },
];

export type VoiceMode = "ai" | "browser";

export interface SpeechControls {
  speaking: boolean;
  wordIndex: number;
  words: string[];
  speak: (text: string, onEnd?: () => void) => void;
  stop: () => void;
  prefetch: (text: string, storyId?: string, pageIdx?: number) => void;
  setStoryContext: (storyId?: string, pageIdx?: number) => void;
  // Voice mode
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;
  // AI voice settings
  aiVoice: AIVoiceName;
  setAiVoice: (v: AIVoiceName) => void;
  aiSpeed: number;
  setAiSpeed: (s: number) => void;
  // Browser voice settings (kept for fallback)
  voice: SpeechSynthesisVoice | null;
  setVoice: (v: SpeechSynthesisVoice) => void;
  rate: number;
  setRate: (r: number) => void;
  allVoices: SpeechSynthesisVoice[];
  // Loading state for AI audio
  loading: boolean;
}
