"use client";

/**
 * Parent Settings modal — opened from the ⚙️ gear button in the library
 * header. Home for preferences that apply across every story:
 * audio/visual effects, story-questions toggle, feedback link (beta
 * period), future accessibility options.
 *
 * Kept intentionally separate from VoiceModal (the 🎙️ modal) because
 * voice-specific settings and parent-wide preferences have different
 * mental models — one is per-story, one is per-device.
 */

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
