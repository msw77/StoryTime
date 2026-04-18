"use client";

import { AIVoiceName, AI_VOICES } from "@/types/story";

interface VoiceModalProps {
  show: boolean;
  onClose: () => void;
  /** When true, voice selection is locked — classics use character voices */
  isClassic?: boolean;
  // AI voice
  aiVoice: AIVoiceName;
  setAiVoice: (v: AIVoiceName) => void;
  aiSpeed: number;
  setAiSpeed: (s: number) => void;
}

export function VoiceModal({
  show, onClose, isClassic,
  aiVoice, setAiVoice, aiSpeed, setAiSpeed,
}: VoiceModalProps) {
  if (!show) return null;

  const previewAI = async (voiceId: AIVoiceName) => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Once upon a time, a brave little fox set off on a great adventure.",
          voice: voiceId,
          speed: aiSpeed,
        }),
      });

      if (!res.ok) return;
      const data = await res.json();

      const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      const blob = new Blob([audioBytes], { type: data.contentType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    } catch {
      // Silently fail preview
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🎙️ Voice Settings</h3>

        {/* Classic stories use pre-generated multi-voice audio —
            voice selection is locked. Show a friendly note instead. */}
        {isClassic && (
          <div style={{
            textAlign: "center",
            padding: "24px 16px",
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎭</div>
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 8,
            }}>
              Character Voices
            </div>
            <p style={{
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.5,
              maxWidth: 280,
              margin: "0 auto",
            }}>
              Classic stories use unique voices for each character — the narrator, the wolf, the pigs, and more — for a theatrical storytime experience.
            </p>
          </div>
        )}

        {/* Voice picker — hidden for classics (they use pre-generated audio) */}
        {!isClassic && (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600, marginBottom: 12 }}>
              Professional AI narration powered by OpenAI. Sounds natural and expressive — perfect for storytime!
            </p>

            <div className="speed-section">
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

            <div style={{ marginTop: 16 }}>
              {AI_VOICES.map((v) => (
                <div
                  key={v.id}
                  className={`voice-item ${aiVoice === v.id ? "active" : ""}`}
                  onClick={() => setAiVoice(v.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div className="voice-name">
                      {v.id === "nova" ? "⭐ " : ""}{v.label}
                    </div>
                    <div className="voice-lang">{v.desc}</div>
                  </div>
                  <button
                    className="preview-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      previewAI(v.id);
                    }}
                  >
                    ▶ Preview
                  </button>
                </div>
              ))}
            </div>
          </>
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
