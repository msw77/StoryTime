"use client";

interface VoiceModalProps {
  show: boolean;
  onClose: () => void;
  allVoices: SpeechSynthesisVoice[];
  voice: SpeechSynthesisVoice | null;
  setVoice: (v: SpeechSynthesisVoice) => void;
  rate: number;
  setRate: (r: number) => void;
}

export function VoiceModal({ show, onClose, allVoices, voice, setVoice, rate, setRate }: VoiceModalProps) {
  if (!show) return null;

  const preview = (v: SpeechSynthesisVoice) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(
      "Once upon a time, a brave little fox set off on a great adventure. Would she find what she was looking for?"
    );
    u.voice = v;
    u.rate = rate;
    u.pitch = 0.97;
    window.speechSynthesis.speak(u);
  };

  const isEnhanced = (v: SpeechSynthesisVoice) => /enhanced|premium/i.test(v.name);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🎙️ Choose a Voice</h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          Voices marked ✨ are high-quality enhanced voices and sound much more
          natural.
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
                    {isEnhanced(v) ? "✨ " : ""}
                    {v.name}
                  </div>
                  <div className="voice-lang">
                    {v.lang}
                    {isEnhanced(v) ? " · Enhanced" : ""}
                  </div>
                </div>
                <button
                  className="preview-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    preview(v);
                  }}
                >
                  ▶ Preview
                </button>
              </div>
            ))}
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
