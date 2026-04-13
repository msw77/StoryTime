"use client";

import { VoiceMode, AIVoiceName, AI_VOICES } from "@/types/story";

interface VoiceModalProps {
  show: boolean;
  onClose: () => void;
  // Voice mode
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;
  // AI voice
  aiVoice: AIVoiceName;
  setAiVoice: (v: AIVoiceName) => void;
  aiSpeed: number;
  setAiSpeed: (s: number) => void;
  // Browser voice (fallback)
  allVoices: SpeechSynthesisVoice[];
  voice: SpeechSynthesisVoice | null;
  setVoice: (v: SpeechSynthesisVoice) => void;
  rate: number;
  setRate: (r: number) => void;
}

export function VoiceModal({
  show, onClose,
  voiceMode, setVoiceMode,
  aiVoice, setAiVoice, aiSpeed, setAiSpeed,
  allVoices, voice, setVoice, rate, setRate,
}: VoiceModalProps) {
  if (!show) return null;

  const previewBrowser = (v: SpeechSynthesisVoice) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(
      "Once upon a time, a brave little fox set off on a great adventure."
    );
    u.voice = v;
    u.rate = rate;
    u.pitch = 0.97;
    window.speechSynthesis.speak(u);
  };

  const previewAI = async (voiceId: AIVoiceName) => {
    // Stop any browser speech
    window.speechSynthesis.cancel();

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

  const isEnhanced = (v: SpeechSynthesisVoice) => /enhanced|premium/i.test(v.name);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🎙️ Voice Settings</h3>

        {/* Mode toggle */}
        <div className="voice-mode-toggle">
          <button
            className={`mode-btn ${voiceMode === "ai" ? "active" : ""}`}
            onClick={() => setVoiceMode("ai")}
          >
            ✨ AI Voice
          </button>
          <button
            className={`mode-btn ${voiceMode === "browser" ? "active" : ""}`}
            onClick={() => setVoiceMode("browser")}
          >
            🔊 Device Voice
          </button>
        </div>

        {voiceMode === "ai" ? (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600, marginBottom: 12 }}>
              Professional AI narration powered by OpenAI. Sounds natural and expressive — perfect for storytime!
            </p>

            <div className="speed-section">
              <label>Speed: {aiSpeed.toFixed(1)}x</label>
              <input
                type="range"
                className="speed-slider"
                min="0.7"
                max="1.3"
                step="0.1"
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
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600, marginBottom: 12 }}>
              Uses your device&apos;s built-in voices. Free and works offline. Voices marked ✨ sound more natural.
            </p>

            <div className="speed-section">
              <label>Speed: {rate.toFixed(2)}x</label>
              <input
                type="range"
                className="speed-slider"
                min="0.6"
                max="1.1"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(+e.target.value)}
              />
            </div>

            <div style={{ marginTop: 16 }}>
              {[...allVoices]
                .sort((a, b) => {
                  const ae = /enhanced|premium/i.test(a.name) ? 0 : 1;
                  const be = /enhanced|premium/i.test(b.name) ? 0 : 1;
                  return ae - be || a.name.localeCompare(b.name);
                })
                .map((v, i) => (
                  <div
                    key={i}
                    className={`voice-item ${voice?.name === v.name ? "active" : ""}`}
                    onClick={() => setVoice(v)}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="voice-name">
                        {isEnhanced(v) ? "✨ " : ""}{v.name}
                      </div>
                      <div className="voice-lang">
                        {v.lang}{isEnhanced(v) ? " · Enhanced" : ""}
                      </div>
                    </div>
                    <button
                      className="preview-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        previewBrowser(v);
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
