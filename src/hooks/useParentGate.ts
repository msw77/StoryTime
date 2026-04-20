"use client";

/**
 * Parent-gate unlock state — hooks version.
 *
 * StoryTime is used by kids aged 2-10 alongside their parents. Anything
 * that would be disruptive if a kid tapped it by accident (account
 * management, sign-out, subscription settings, voice preferences) sits
 * behind a simple math challenge — the classic "for grown-ups only"
 * arithmetic prompt that adults solve in 2 seconds but a 4-year-old
 * can't.
 *
 * This hook just tracks the boolean state — `isUnlocked` — plus a
 * 5-minute auto-lock timer so a parent who solves the math once can
 * navigate in and out of Parent Settings for a while without re-doing
 * arithmetic every single time. After 5 idle minutes it re-locks.
 *
 * Storage: in-memory only. Not localStorage — we deliberately want this
 * to reset on every app launch / browser restart. Persisting unlock
 * across sessions would defeat the point.
 *
 * Scope: the hook is instantiated once per app mount (in page.tsx) and
 * the unlock/lock functions are passed down. If we ever need to gate
 * multiple unrelated surfaces, we can lift this to a Context, but
 * single-home-in-page.tsx is fine until then.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Auto-lock timeout in milliseconds. 5 min is long enough for a parent
 *  to change voice, browse subscription, and exit without re-math;
 *  short enough that a kid grabbing a handed-off phone won't walk
 *  into an unlocked Parent Settings. */
const UNLOCK_TIMEOUT_MS = 5 * 60 * 1000;

export interface ParentGateState {
  /** True while the parent has recently solved the math challenge. */
  isUnlocked: boolean;
  /** Mark the gate as solved. Also (re)starts the 5-min auto-lock timer. */
  unlock: () => void;
  /** Force-lock immediately (e.g. after sign-out, or from a "lock" button
   *  we might add later). */
  lock: () => void;
}

export function useParentGate(): ParentGateState {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const lock = useCallback(() => {
    clearTimer();
    setIsUnlocked(false);
  }, [clearTimer]);

  const unlock = useCallback(() => {
    clearTimer();
    setIsUnlocked(true);
    // Schedule auto-lock. We reset this every time unlock() is called —
    // not just the first — so if a parent re-opens settings within the
    // window, the timer restarts fresh. Feels more forgiving than a
    // hard 5-min cap from the first unlock.
    timerRef.current = setTimeout(() => {
      setIsUnlocked(false);
      timerRef.current = null;
    }, UNLOCK_TIMEOUT_MS);
  }, [clearTimer]);

  // Clean up the auto-lock timer if the component hosting this hook
  // unmounts (unlikely in practice since page.tsx is the root, but
  // React hooks hygiene — avoids a zombie setTimeout firing on a dead
  // component during hot-reload in dev).
  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  return { isUnlocked, unlock, lock };
}
