"use client";

/**
 * ComprehensionQuestionsScreen — Science-of-Reading Pillar 5.
 *
 * Shown between the last page of the story and the normal "The End!"
 * celebration IF:
 *   - Story has comprehensionQuestions generated (2-3 for ages 4-7,
 *     3 for ages 7-10; absent for ages 2-4 — those stories skip this
 *     screen entirely).
 *   - Parent has the "Story questions" setting ON (default yes).
 *
 * UX rules (firm):
 *   - NEVER quiz tone. No "You got X of Y right", no red X on wrong,
 *     no grade-style percentages. Warm and conversational.
 *   - Tap to answer. A brief 400ms pause on the chosen card (light
 *     green halo for correct, gentle pulse for recall/inference
 *     wrong) then advance. Connection questions always halo (they're
 *     about the kid's feelings; all three options are correct).
 *   - No "try again". Wrong answer just moves on. The parent
 *     dashboard aggregates accuracy; the child doesn't see it.
 *   - Skip button in the top-right lets a parent bail out if the
 *     kid is losing interest. That goes straight to the celebration.
 *
 * Data flow:
 *   - Each answer fires POST /api/comprehension fire-and-forget.
 *   - onComplete callback tells ReaderScreen to advance to the
 *     existing celebration/save/library flow.
 */

import { useEffect, useRef, useState } from "react";
import type { ComprehensionQuestion } from "@/types/story";

interface ComprehensionQuestionsScreenProps {
  questions: ComprehensionQuestion[];
  storyId: string;
  childProfileId: string | null;
  onComplete: () => void;
  onTap?: () => void; // SFX hook — parent can pipe sfx.tap here
}

export function ComprehensionQuestionsScreen({
  questions,
  storyId,
  childProfileId,
  onComplete,
  onTap,
}: ComprehensionQuestionsScreenProps) {
  const [qIdx, setQIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
    };
  }, []);

  const question = questions[qIdx];
  if (!question) {
    // Defensive: shouldn't happen, but if questions is empty just skip.
    onComplete();
    return null;
  }

  const handleSelect = (optionIdx: number) => {
    if (selectedOption !== null) return; // already answered
    if (onTap) onTap();
    setSelectedOption(optionIdx);

    // Fire-and-forget analytics
    if (childProfileId) {
      const opt = question.options[optionIdx];
      void fetch("/api/comprehension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childProfileId,
          storyId,
          questionIdx: qIdx,
          questionType: question.type,
          chosenOptionIdx: optionIdx,
          correct: !!opt?.correct,
        }),
      }).catch(() => { /* analytics failures never block UX */ });
    }

    // Hold on the chosen card for 700ms so the kid registers the
    // visual feedback, then either advance to next question or
    // complete. Connection questions get a warmer pause since there's
    // no "correct"/"incorrect" distinction to process.
    const pauseMs = question.type === "connection" ? 900 : 700;
    advanceRef.current = setTimeout(() => {
      setSelectedOption(null);
      if (qIdx + 1 < questions.length) {
        setQIdx((i) => i + 1);
      } else {
        onComplete();
      }
    }, pauseMs);
  };

  const typeIntro: Record<ComprehensionQuestion["type"], string> = {
    recall: "Let's think back...",
    inference: "Why do you think?",
    connection: "Just for you...",
  };

  return (
    <div className="reader">
      <div className="comprehension-screen">
        <button
          type="button"
          className="comprehension-skip"
          onClick={onComplete}
          aria-label="Skip questions"
        >
          Skip →
        </button>

        <div className="comprehension-progress" aria-hidden="true">
          {questions.map((_, i) => (
            <span
              key={i}
              className={`comprehension-dot${i < qIdx ? " done" : ""}${i === qIdx ? " current" : ""}`}
            />
          ))}
        </div>

        <div className="comprehension-intro">{typeIntro[question.type]}</div>
        <h2 className="comprehension-question">{question.question}</h2>

        <div className="comprehension-options">
          {question.options.map((opt, i) => {
            const isSelected = selectedOption === i;
            // Visual feedback state:
            // - selected + correct: "correct" (green halo)
            // - selected + wrong (recall/inference): "gentle" (neutral pulse)
            // - selected + connection: always "correct"
            // - unselected: no state
            let stateClass = "";
            if (isSelected) {
              if (question.type === "connection" || opt.correct) {
                stateClass = "chose-correct";
              } else {
                stateClass = "chose-neutral";
              }
            }
            return (
              <button
                key={i}
                type="button"
                className={`comprehension-option ${stateClass}`}
                onClick={() => handleSelect(i)}
                disabled={selectedOption !== null}
              >
                <span className="comprehension-option-emoji" aria-hidden="true">
                  {opt.emoji}
                </span>
                <span className="comprehension-option-text">{opt.text}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
