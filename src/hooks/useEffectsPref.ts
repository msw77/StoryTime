"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Single on/off preference for "Audio & visual effects" — the toggle
 * that parents can flip in the Parent Settings modal to turn off all
 * the immersive story-time polish: Ken Burns pan on illustrations,
 * 3D page-flip animation, and (once Sprint 2 lands) ambient sound
 * beds + inline SFX cues.
 *
 * Defaults to ON so new users get the full experience immediately.
 * Persisted in localStorage so the preference sticks across sessions
 * and across profiles. Intentionally device-scoped, not account-scoped
 * — a parent might want effects off on the tablet in the quiet room
 * but on for the kid's own iPad, and hanging this off the Clerk account
 * would prevent that.
 *
 * The hook returns [enabled, setEnabled]. setEnabled writes through to
 * localStorage immediately and fires a `storage` event so other tabs
 * (e.g. a parent tweaking settings in one window while the kid reads
 * in another) stay in sync.
 */
const STORAGE_KEY = "storytime:effects-enabled";

function readInitial(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true; // default ON
    return raw === "true";
  } catch {
    return true;
  }
}

export function useEffectsPref(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(readInitial);

  // Cross-tab sync: listen for storage events and mirror them in local state.
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
      // Private mode / storage blocked — state still updates in memory,
      // user just loses persistence. Not worth surfacing.
    }
  }, []);

  return [enabled, setEnabled];
}
