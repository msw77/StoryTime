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
}

export function ParentSettingsModal({
  show,
  onClose,
  effectsEnabled,
  setEffectsEnabled,
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

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button className="pill-btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
