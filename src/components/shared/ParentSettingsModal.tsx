"use client";

/**
 * Parent Settings modal — opened from the ⚙️ gear button in the library
 * header. This is the intended home for any preference that isn't
 * story-specific: audio/visual effects, future accessibility options,
 * future consent toggles for Sprint 4 signature features, etc.
 *
 * Today it holds a single control: the master "Audio & visual effects"
 * toggle, which defaults ON and, when off, disables Ken Burns pan on
 * illustrations, the 3D page-flip animation, and (once Sprint 2 lands)
 * ambient sound beds + inline SFX cues. The preference is persisted
 * locally via useEffectsPref so it survives across sessions.
 *
 * Kept intentionally separate from VoiceModal (the 🎙️ modal) because
 * voice-specific settings and parent-wide preferences have different
 * mental models — one is per-story, one is per-device.
 */

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

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button className="pill-btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
