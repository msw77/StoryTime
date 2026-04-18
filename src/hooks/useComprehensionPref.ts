"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Parent preference: show Science-of-Reading comprehension questions
 * at the end of each story, yes/no. Default ON — parents who bought a
 * read-along app because they want their kid to learn generally DO
 * want the comprehension layer. Easy to flip off for wind-down /
 * bedtime / "just let my kid relax" modes.
 *
 * Companion to useEffectsPref. Same localStorage pattern, same
 * cross-tab sync behavior, same device-scoped (not account-scoped)
 * rationale.
 *
 * When OFF:
 *   - Last page's "The End!" celebration still plays
 *   - Save / Read Again / Back to Library still work
 *   - Questions screen is simply skipped
 */
const STORAGE_KEY = "storytime:comprehension-questions-enabled";

function readInitial(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function useComprehensionPref(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(readInitial);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setEnabledState(e.newValue === null ? true : e.newValue === "true");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* storage blocked — state updates in memory only */
    }
  }, []);

  return [enabled, setEnabled];
}
