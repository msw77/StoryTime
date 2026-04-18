"use client";

/**
 * VocabWordModal — Word Glow tap-to-define feature (Science of Reading,
 * Pillar 4: Vocabulary).
 *
 * When a child taps a word that the AI flagged during story generation
 * as vocabulary-worthy (3–5 per page), this modal slides up and shows
 * an age-appropriate definition. Tapping "Got it" dismisses; narration
 * resumes from where it was paused.
 *
 * Content adapts by story age band:
 *   - 2–4: giant emoji + the word spoken twice. No text definition.
 *     (Pre-readers can't parse a sentence-length definition anyway.)
 *   - 4–7: emoji + word + a single easy sentence. Optional tap-to-hear.
 *   - 7–10: emoji + word + pronunciation + richer definition + example
 *     sentence. Old enough to appreciate the extra context.
 *
 * Intentionally NOT fullscreen — the page text stays visible in the
 * dimmed backdrop so the child keeps context on the story. The modal
 * pins to bottom on mobile and center on wider screens.
 *
 * Tells the parent:
 *   onDismiss — always. Resume narration, clear focus.
 *   onHearWord — fires when the kid taps the speaker icon or (for 2–4)
 *     on mount, so we can trigger TTS without the modal owning audio.
 */

import { useEffect, useRef } from "react";
import type { VocabWord, ReadAloudWord } from "@/types/story";

interface VocabWordModalProps {
  word: VocabWord;
  /** Story age band: "2-4" | "4-7" | "7-10". Selects which definition
   *  to display and whether to hide text fields entirely. */
  ageBand: string;
  onDismiss: () => void;
  /** Fire when the kid wants to hear the word pronounced. Parent owns
   *  the TTS call (keeps the modal pure). */
  onHearWord?: () => void;
  /** Matching readAloud entry for this word (if Claude flagged it as
   *  one). When present, we show a "Sound It Out" button that triggers
   *  syllable-by-syllable playback. Used for Pillars 1 + 2 (phonemic
   *  awareness + phonics) alongside Word Glow's vocabulary work. */
  readAloud?: ReadAloudWord | null;
  onSoundItOut?: () => void;
}

export function VocabWordModal({
  word,
  ageBand,
  onDismiss,
  onHearWord,
  readAloud,
  onSoundItOut,
}: VocabWordModalProps) {
  // Focus trap + Escape-to-dismiss. For kids we can't lean on keyboard
  // but parents testing on desktop expect Esc to close.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-speak on mount for the 2–4 band, where the word IS the
  // definition. Older kids get a speaker button to tap.
  useEffect(() => {
    if (ageBand === "2-4" && onHearWord) {
      // Slight delay so the modal animation completes first.
      const t = setTimeout(onHearWord, 350);
      return () => clearTimeout(t);
    }
  }, [ageBand, onHearWord]);

  const is2to4 = ageBand === "2-4";
  const is7to10 = ageBand === "7-10";

  // Age-appropriate definition. Fallback chain:
  //  7-10 prefers 7-10 def → 4-7 if missing
  //  4-7 uses 4-7 def
  //  2-4 uses nothing (emoji is the answer)
  const definition = is2to4
    ? null
    : is7to10
      ? word.definition_7_10 || word.definition_4_7
      : word.definition_4_7;

  return (
    <div
      className="vocab-modal-backdrop"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        className="vocab-modal"
        role="dialog"
        aria-labelledby="vocab-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Big emoji at top — visual anchor for all ages */}
        <div className="vocab-modal-emoji" aria-hidden="true">
          {word.emoji || "✨"}
        </div>

        {/* The word itself */}
        <div className="vocab-modal-word-row">
          <h2 id="vocab-modal-title" className="vocab-modal-word">
            {word.word}
          </h2>
          {onHearWord && (
            <button
              type="button"
              className="vocab-modal-hear-btn"
              onClick={onHearWord}
              aria-label={`Hear the word ${word.word}`}
            >
              🔊
            </button>
          )}
        </div>

        {/* Pronunciation line — 7-10 only */}
        {is7to10 && word.pronunciation && (
          <div className="vocab-modal-pronunciation">
            {word.pronunciation}
          </div>
        )}

        {/* Definition sentence — 4-7 and 7-10 */}
        {definition && (
          <p className="vocab-modal-definition">{definition}</p>
        )}

        {/* Example sentence — 7-10 only */}
        {is7to10 && word.exampleSentence && (
          <p className="vocab-modal-example">
            <span className="vocab-modal-example-label">Like this:</span>{" "}
            {word.exampleSentence}
          </p>
        )}

        {/* Sound It Out syllable block removed 2026-04-18 — TTS could
            not do phonetic segmentation cleanly and the output sounded
            wrong to parents. Leaving the props on the interface so
            wiring can be restored if we ship phoneme-level audio. */}

        <button
          type="button"
          className="vocab-modal-dismiss"
          onClick={onDismiss}
        >
          Got it ✨
        </button>
      </div>
    </div>
  );
}
