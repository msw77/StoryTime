export interface StoryPage {
  scene?: string;
  mood?: string;
  sounds?: string[];
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

export interface SpeechControls {
  speaking: boolean;
  wordIndex: number;
  words: string[];
  speak: (text: string, onEnd?: () => void) => void;
  stop: () => void;
  voice: SpeechSynthesisVoice | null;
  setVoice: (v: SpeechSynthesisVoice) => void;
  rate: number;
  setRate: (r: number) => void;
  allVoices: SpeechSynthesisVoice[];
}
