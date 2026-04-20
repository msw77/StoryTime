"use client";

/**
 * Parent Settings modal — opened from the ⚙️ gear button in the library
 * header. Single home for all parent-facing preferences: narration
 * voice + speed, audio/visual effects, story-questions toggle,
 * reading-progress link, feedback link.
 *
 * History: originally had a separate 🎙️ Voice Modal for voice picking.
 * Parent testing flagged two icons in the header as cramped and
 * confusing ("why are there two settings buttons?"), so the voice
 * picker consolidated into here. One settings pane, one mental model.
 * Classic stories still override the voice at playback time because
 * they use baked-in character voices — that logic sits in the audio
 * pipeline, not this UI.
 */

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { AIVoiceName, AI_VOICES } from "@/types/story";
import { DEV_AUTH_BYPASS } from "@/lib/devBypass";

// Preview a voice's narration with a canned sentence. Fire-and-forget;
// we don't cache or manage the Audio element beyond the single play —
// parents tap between voices rapidly and expect instant feedback.
async function previewVoice(voice: AIVoiceName, speed: number) {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Once upon a time, a brave little fox set off on a great adventure.",
        voice,
        speed,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const blob = new Blob([audioBytes], { type: data.contentType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    void audio.play();
  } catch {
    // Silently fail — a parent mashing preview buttons during a network
    // hiccup shouldn't see an error toast.
  }
}

// Feedback link component. Renders ONLY when one of two env vars is
// set, so non-beta builds hide the button entirely (instead of having
// a broken "leave feedback" link in the final product).
//
// Priority order:
//   1. NEXT_PUBLIC_FEEDBACK_URL — a Tally/Typeform/Google Form URL.
//      Opens in a new tab. Preferred because it collects structured
//      data without the parent opening their email client.
//   2. NEXT_PUBLIC_FEEDBACK_EMAIL — a mailto: fallback. Opens the
//      native mail client with a pre-filled subject. Works even if
//      you haven't set up a form yet; useful for the first day of
//      beta when you just want any reply at all.
//
// Neither set = no button. Silent fail by design — we don't want a
// "Send feedback" link that 404s when a tester taps it.
function FeedbackLink() {
  const url = process.env.NEXT_PUBLIC_FEEDBACK_URL;
  const email = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL;
  if (!url && !email) return null;

  const href = url
    ? url
    : `mailto:${email}?subject=${encodeURIComponent("StoryTime feedback")}&body=${encodeURIComponent(
        "What age is your kid?\n\nWhat felt magical?\n\nWhat felt broken or confusing?\n\nWould you recommend this to another parent?",
      )}`;

  return (
    <div style={{ marginTop: 14, textAlign: "center" }}>
      <a
        href={href}
        target={url ? "_blank" : undefined}
        rel={url ? "noopener noreferrer" : undefined}
        className="settings-feedback-link"
      >
        💬 Send feedback
      </a>
    </div>
  );
}

interface ParentSettingsModalProps {
  show: boolean;
  onClose: () => void;
  effectsEnabled: boolean;
  setEffectsEnabled: (enabled: boolean) => void;
  /** Parent toggle for the Science-of-Reading comprehension questions
   *  that appear at the end of age-4+ stories. Default ON. Toggling
   *  OFF lets parents bypass the teaching layer for wind-down or
   *  bedtime reads. */
  comprehensionEnabled: boolean;
  setComprehensionEnabled: (enabled: boolean) => void;
  /** Narration voice + speed settings, lifted from useSpeech. Classic
   *  stories ignore these at playback (they have their own character
   *  voices), so we intentionally don't surface a "locked" state here
   *  — the parent can still choose their preferred voice for AI
   *  narration on non-classic stories. */
  aiVoice: AIVoiceName;
  setAiVoice: (v: AIVoiceName) => void;
  aiSpeed: number;
  setAiSpeed: (s: number) => void;
  /** Open the parent dashboard. Settings modal closes first, then the
   *  dashboard screen takes over. Provided by the parent component so
   *  the modal stays agnostic of the app-level screen state machine. */
  onOpenDashboard?: () => void;
}

export function ParentSettingsModal({
  show,
  onClose,
  effectsEnabled,
  setEffectsEnabled,
  comprehensionEnabled,
  setComprehensionEnabled,
  aiVoice,
  setAiVoice,
  aiSpeed,
  setAiSpeed,
  onOpenDashboard,
}: ParentSettingsModalProps) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ Parent Settings</h3>

        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          Controls that apply across every story on this device.
        </p>

        {/* ── Narration — collapsible sub-section ──────────────────
            Default shows the currently-selected voice label with a
            "Change" affordance and the always-useful speed slider.
            Tapping "Change" reveals the full voice list inline so
            this section only expands if the parent actually wants
            to audition alternatives. Most parents pick once and
            never return to this control. */}
        <NarrationSection
          aiVoice={aiVoice}
          setAiVoice={setAiVoice}
          aiSpeed={aiSpeed}
          setAiSpeed={setAiSpeed}
        />

        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 8,
          }}
        >
          Reading experience
        </div>

        {/* Audio & visual effects master toggle.
            Intentionally a single control rather than two (audio vs
            visual separately). If a parent wants a calmer experience
            they usually want both off at once, and splitting them
            into two toggles creates a "why are SFX still playing?"
            confusion loop. */}
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Audio &amp; visual effects</div>
            <div className="settings-row-desc">
              Ken Burns pan on illustrations, page-flip animation,
              ambient sounds, and inline sound effects during stories.
              Turn off for a calmer, quieter reading experience.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={effectsEnabled}
            className={`autoplay-toggle ${effectsEnabled ? "on" : ""}`}
            onClick={() => setEffectsEnabled(!effectsEnabled)}
            title={effectsEnabled ? "Effects are on — tap to turn off" : "Effects are off — tap to turn on"}
          >
            <span>{effectsEnabled ? "ON" : "OFF"}</span>
            <span className="autoplay-toggle-track" aria-hidden="true">
              <span className="autoplay-toggle-knob" />
            </span>
          </button>
        </div>

        {/* Story Questions toggle — after each story, 2-3 warm
            conversational questions check comprehension (Pillar 5 of
            the Science of Reading). Off by default would be wrong —
            most parents buying a read-along app want the teaching
            layer — but easy to flip for wind-down reads. */}
        <div className="settings-row" style={{ marginTop: 12 }}>
          <div className="settings-row-info">
            <div className="settings-row-title">Story questions</div>
            <div className="settings-row-desc">
              After each story (ages 4+), show a few warm questions
              about what happened. No scores shown to the child —
              results land in the parent dashboard. Turn off for quiet
              wind-down reads.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={comprehensionEnabled}
            className={`autoplay-toggle ${comprehensionEnabled ? "on" : ""}`}
            onClick={() => setComprehensionEnabled(!comprehensionEnabled)}
            title={comprehensionEnabled ? "Questions are on — tap to turn off" : "Questions are off — tap to turn on"}
          >
            <span>{comprehensionEnabled ? "ON" : "OFF"}</span>
            <span className="autoplay-toggle-track" aria-hidden="true">
              <span className="autoplay-toggle-knob" />
            </span>
          </button>
        </div>

        {onOpenDashboard && (
          <div style={{ marginTop: 18, textAlign: "center" }}>
            <button
              type="button"
              className="pill-btn secondary"
              onClick={() => {
                onClose();
                onOpenDashboard();
              }}
            >
              View reading progress →
            </button>
          </div>
        )}

        {/* Account section — previously the Clerk UserButton sat in the
            header. Moving it behind the parent gate keeps toddlers from
            accidentally triggering Manage Account / Sign Out, and
            cleans up the header to just [search · gear · kid-picker].
            Rendered only outside dev-auth-bypass mode so the bypassed
            preview doesn't crash trying to call Clerk without a
            provider. */}
        {!DEV_AUTH_BYPASS && <AccountSection onClose={onClose} />}

        {/* Feedback link. Shown only when configured so non-beta users
            don't see a stranger button. Prefers a hosted form
            (Tally/Typeform) via NEXT_PUBLIC_FEEDBACK_URL; falls back to
            a mailto: if NEXT_PUBLIC_FEEDBACK_EMAIL is set instead.
            Either way, tap → opens in a new tab / native mail client. */}
        <FeedbackLink />

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button className="pill-btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Narration sub-section ─────────────────────────────────────────────
// Collapsible voice picker. Default: shows section header, current
// voice, a "Change" link, and the speed slider. Parent rarely swaps
// voice mid-session, so keeping the full list hidden avoids pushing
// the rest of Parent Settings off-screen. Tapping "Change" expands
// the list inline; tapping a new voice sets it but leaves the list
// open so the parent can preview/compare without re-opening.
function NarrationSection({
  aiVoice,
  setAiVoice,
  aiSpeed,
  setAiSpeed,
}: {
  aiVoice: AIVoiceName;
  setAiVoice: (v: AIVoiceName) => void;
  aiSpeed: number;
  setAiSpeed: (s: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const currentVoice =
    AI_VOICES.find((v) => v.id === aiVoice) ?? AI_VOICES[0];

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        Narration
      </div>

      {/* Current voice row — condensed display + Change affordance */}
      <div
        className="settings-narration-current"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="settings-narration-current-name">
            {currentVoice.id === "nova" ? "⭐ " : ""}
            {currentVoice.label}
          </div>
          <div className="settings-narration-current-desc">
            {currentVoice.desc}
          </div>
        </div>
        <span
          className="settings-narration-chevron"
          aria-hidden="true"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          ›
        </span>
      </div>

      {/* Speed slider is always visible — adjusts more often than voice */}
      <div className="speed-section" style={{ marginTop: 10 }}>
        <label>Speed: {aiSpeed.toFixed(2)}x</label>
        <input
          type="range"
          className="speed-slider"
          min="0.7"
          max="1.4"
          step="0.05"
          value={aiSpeed}
          onChange={(e) => setAiSpeed(+e.target.value)}
        />
      </div>

      {/* Expanded: full voice list with previews */}
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {AI_VOICES.map((v) => (
            <div
              key={v.id}
              className={`voice-item ${aiVoice === v.id ? "active" : ""}`}
              onClick={() => setAiVoice(v.id)}
            >
              <div style={{ flex: 1 }}>
                <div className="voice-name">
                  {v.id === "nova" ? "⭐ " : ""}
                  {v.label}
                </div>
                <div className="voice-lang">{v.desc}</div>
              </div>
              <button
                className="preview-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void previewVoice(v.id, aiSpeed);
                }}
              >
                ▶ Preview
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Account section ───────────────────────────────────────────────────
// Replaces the Clerk <UserButton /> that used to sit in the library
// header. Shows the current signed-in email, opens Clerk's account
// management page, and signs the parent out. All three require the
// math-challenge gate to open Parent Settings first, so a toddler
// can't accidentally trigger sign-out by tapping the wrong icon.
//
// Only rendered when Clerk is actually available (not in
// DEV_AUTH_BYPASS mode). The parent gates this via the conditional
// render in ParentSettingsModal above — this component always calls
// the Clerk hooks.
function AccountSection({ onClose }: { onClose: () => void }) {
  const { user, isLoaded } = useUser();
  const { openUserProfile, signOut } = useClerk();

  if (!isLoaded) return null;

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "";

  const handleSignOut = async () => {
    // Close the modal FIRST so the user sees immediate feedback, then
    // kick off sign-out. Clerk's signOut triggers a re-render at the
    // app root where useAuthState flips to signed-out, which routes
    // the app back to the landing/sign-in view.
    onClose();
    await signOut();
  };

  return (
    <div className="account-section">
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        Account
      </div>
      {email && (
        <div className="account-email" title={email}>
          {email}
        </div>
      )}
      <div className="account-actions">
        <button
          type="button"
          className="pill-btn secondary"
          onClick={() => openUserProfile()}
        >
          Manage account
        </button>
        <button
          type="button"
          className="pill-btn secondary account-signout"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
