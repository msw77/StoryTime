"use client";

/**
 * Parent-gate math challenge modal.
 *
 * Shown when a kid (or parent) taps the gear ⚙️ on the home screen
 * before Parent Settings has been unlocked this session. Renders a
 * simple two-digit addition problem — trivial for an adult, genuinely
 * hard for kids under ~8 who are StoryTime's core audience.
 *
 * Design notes:
 * - Not a security control. Any sufficiently determined 8-year-old
 *   can solve "37 + 24" given a minute. This is a speed bump against
 *   accidental taps, not an anti-tamper gate. If you're on the fence
 *   about whether something needs this vs. a real auth flow, this
 *   is definitely the "accidental tap" end of the spectrum.
 * - We randomize the numbers on every mount so a kid can't learn
 *   and memorize a single answer after one over-the-shoulder look.
 * - Two-digit + two-digit with a carry is the sweet spot. One-digit
 *   math is doable by 5-year-olds; three-digit starts to annoy parents.
 * - Wrong answers don't lock out — they shake the input, clear it,
 *   and generate a new problem. No rate limiting. (Rate-limiting math
 *   answers would feel punishing for parents who miss-tap, and offers
 *   no real security benefit since this isn't a security control.)
 * - Enter key submits. That's the primary keyboard UX for parents
 *   using a hardware keyboard or an iOS number-pad with Return.
 *
 * State contract:
 * - `show` — render or not. Parent owns the bool.
 * - `onSolve` — fires when correct answer submitted. Parent should
 *   flip the ParentGate state to unlocked AND open whatever they were
 *   originally trying to open.
 * - `onClose` — fires when parent taps the scrim or the X button.
 *   Does NOT unlock. Just dismisses the challenge.
 */

import { useEffect, useRef, useState } from "react";

interface Problem {
  a: number;
  b: number;
  answer: number;
}

/** Generate a fresh two-digit addition problem with a guaranteed carry,
 *  and a sum that stays under 100 (i.e. the answer is always two
 *  digits, never three). User feedback: some parents tripped over
 *  three-digit sums like 78 + 56 = 134 — the carry into the hundreds
 *  column is the part that trips adults who haven't mental-mathed in
 *  a decade. Constraining both addends to 10–49 keeps sums in the
 *  19–98 range while still requiring regrouping in the ones column,
 *  which is what keeps it kid-proof (kids <~8 haven't learned carry
 *  regrouping). */
function makeProblem(): Problem {
  // Loop until we get a problem where the ones digits force a carry.
  // In practice this loops at most 2-3 times on average.
  while (true) {
    const a = 10 + Math.floor(Math.random() * 40); // 10–49
    const b = 10 + Math.floor(Math.random() * 40); // 10–49
    if ((a % 10) + (b % 10) >= 10) {
      return { a, b, answer: a + b };
    }
  }
}

interface ParentGateProps {
  show: boolean;
  onSolve: () => void;
  onClose: () => void;
}

export function ParentGate({ show, onSolve, onClose }: ParentGateProps) {
  const [problem, setProblem] = useState<Problem>(() => makeProblem());
  const [input, setInput] = useState("");
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate a fresh problem each time the gate opens, and autofocus
  // the input so a parent using a physical keyboard can type straight
  // away. Small timeout to let the modal animation settle before
  // focus — avoids the iOS zoom-into-input flash.
  useEffect(() => {
    if (!show) return;
    setProblem(makeProblem());
    setInput("");
    setShake(false);
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const parsed = parseInt(input.trim(), 10);
    if (parsed === problem.answer) {
      onSolve();
      return;
    }
    // Wrong answer — shake, clear, new problem. Re-focus so the parent
    // can immediately type again without tapping the field.
    setShake(true);
    setTimeout(() => setShake(false), 400);
    setProblem(makeProblem());
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal parent-gate-modal ${shake ? "parent-gate-shake" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-gate-title"
      >
        <div className="parent-gate-heading">
          <div className="parent-gate-emoji" aria-hidden="true">🔒</div>
          <h3 id="parent-gate-title">For grown-ups only</h3>
          <p className="parent-gate-sub">Solve this to open Parent Settings</p>
        </div>

        <form onSubmit={handleSubmit} className="parent-gate-form">
          <div className="parent-gate-problem" aria-label={`What is ${problem.a} plus ${problem.b}?`}>
            {problem.a} <span className="parent-gate-op">+</span> {problem.b} <span className="parent-gate-op">=</span>
          </div>
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            className="parent-gate-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="?"
            autoComplete="off"
            aria-label="Answer"
          />
          <div className="parent-gate-actions">
            <button type="button" className="pill-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pill-btn primary" disabled={!input.trim()}>
              Unlock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
