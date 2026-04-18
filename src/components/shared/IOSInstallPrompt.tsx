"use client";

/**
 * Small banner that nudges iPhone/iPad Safari users to install
 * StoryTime as a home-screen app. Android + desktop get the native
 * browser install prompt handled elsewhere; iOS doesn't offer a
 * programmatic install API, so the only way to get an iOS PWA is the
 * user manually tapping Share → Add to Home Screen. This banner
 * teaches them that gesture.
 *
 * Visibility rules (strict — no nag):
 *
 *   1. Only renders on iOS Safari (not Chrome iOS, not in-app webviews
 *      like the Gmail preview or Facebook in-app browser — those
 *      DON'T support Add to Home Screen, so the prompt would be a
 *      dead end).
 *
 *   2. Only renders when NOT already installed. iOS exposes
 *      navigator.standalone to tell us whether we're launched from
 *      the home screen. If yes, the user already did this once —
 *      nothing to promote.
 *
 *   3. Dismisses permanently on tap. LocalStorage flag. We don't
 *      re-show after a tester closes it once.
 *
 * Visual: bottom-pinned card with a soft honey background, a tiny
 * illustration of Safari's Share icon, and a 2-line instruction.
 * Taps a close button to dismiss. No CTA button (there's nothing the
 * JS can do — the user MUST use the native share menu).
 */

import { useEffect, useState } from "react";

const DISMISS_KEY = "storytime:ios-install-prompt-dismissed";

function detectIOSSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (!isIOS) return false;
  // Reject in-app browsers (Gmail, Facebook, Instagram, etc.). They
  // don't have the Share → Add to Home Screen gesture, so our banner
  // would mislead them. Detect by checking for WebKit + absence of
  // Safari's distinct bits.
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA/.test(ua);
  // In-app browsers often have Safari in UA but lack the Gecko-style
  // Version/ tag. Extra filter:
  if (/FBAN|FBAV|Instagram|Line\//.test(ua)) return false;
  return isSafari;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Safari puts navigator.standalone on the nav object (not part of the
  // type definition, so TS needs a cast).
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  // All other browsers expose it via matchMedia.
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function IOSInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return; // already installed
    if (!detectIOSSafari()) return; // not iOS Safari
    // Respect prior dismissal.
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // LocalStorage unavailable (private mode). Show the prompt —
      // annoying if private mode is intentional but simpler than
      // silently hiding education.
    }
    // Small delay so the banner doesn't appear during page load —
    // feels calmer if it slides in a beat after the app mounts.
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore — user just won't have persistence */
    }
  };

  if (!show) return null;

  return (
    <div className="ios-install-prompt" role="dialog" aria-label="Install StoryTime">
      <button
        type="button"
        className="ios-install-close"
        onClick={dismiss}
        aria-label="Close"
      >
        ×
      </button>
      <div className="ios-install-content">
        <div className="ios-install-title">
          Get StoryTime on your home screen
        </div>
        <div className="ios-install-body">
          Tap{" "}
          <span className="ios-install-share" aria-label="the Share button">
            {/* Apple's Share glyph: square with up-arrow. Drawn inline
                so it renders without external asset load. */}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 1.5L5.25 4.25l.75.75L7.5 3.5V10h1V3.5L10 5l.75-.75L8 1.5zM3.5 7v7h9V7h-3v1h2v5H4.5V8h2V7h-3z"
              />
            </svg>
          </span>{" "}
          at the bottom of Safari, then{" "}
          <strong>Add to Home Screen</strong>.
        </div>
      </div>
    </div>
  );
}
