"use client";

import { useState, useEffect } from "react";
import { Story, SpeechControls } from "@/types/story";
import { SceneIllustration } from "./SceneIllustration";

interface ReaderScreenProps {
  story: Story;
  onBack: () => void;
  speech: SpeechControls;
  onSave?: () => void;
}

export function ReaderScreen({ story, onBack, speech, onSave }: ReaderScreenProps) {
  const [pageIdx, setPageIdx] = useState(0);
  const [rating, setRating] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const pages = story.pages;
  const page = pages[pageIdx];
  const canSave = !!story.generated && !!onSave;

  const handleSave = () => {
    if (onSave) onSave();
    setSaved(true);
  };

  const handleBackClick = () => {
    speech.stop();
    if (canSave && !saved) {
      setShowLeavePrompt(true);
    } else {
      onBack();
    }
  };

  const readPage = () => {
    speech.speak(page[1], () => {
      if (pageIdx < pages.length - 1) setPageIdx((p) => p + 1);
      else setFinished(true);
    });
  };

  useEffect(() => {
    speech.stop();
  }, [pageIdx]);

  useEffect(() => () => speech.stop(), []);

  // "Save before leaving?" prompt
  if (showLeavePrompt) {
    return (
      <div className="reader">
        <div className="end-screen">
          <div className="big-emoji">💾</div>
          <h2>Save this story?</h2>
          <p style={{ color: "var(--muted)", fontWeight: 600 }}>
            Do you want to keep this story in your library?
          </p>
          <button className="pill-btn primary" onClick={() => { handleSave(); onBack(); }}>
            Save & Leave
          </button>
          <button className="pill-btn secondary" onClick={onBack}>
            Leave Without Saving
          </button>
          <button
            className="pill-btn secondary"
            onClick={() => setShowLeavePrompt(false)}
            style={{ opacity: 0.7 }}
          >
            Keep Reading
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="reader">
        <div className="end-screen">
          <div className="big-emoji">🎉</div>
          <h2>The End!</h2>
          <p style={{ color: "var(--muted)", fontWeight: 600 }}>
            How did you like this story?
          </p>
          <div className="stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`star ${n <= rating ? "filled" : ""}`}
                onClick={() => setRating(n)}
              >
                ⭐
              </span>
            ))}
          </div>
          {canSave && (
            <button
              className="pill-btn primary"
              onClick={handleSave}
              disabled={saved}
              style={saved ? { opacity: 0.6 } : {}}
            >
              {saved ? "Saved!" : "Save to My Library"}
            </button>
          )}
          <button
            className="pill-btn primary"
            onClick={() => {
              setPageIdx(0);
              setFinished(false);
              setRating(0);
            }}
          >
            Read Again
          </button>
          <button className="pill-btn secondary" onClick={onBack}>
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  const tw = page[1].split(/\s+/);

  return (
    <div className="reader">
      <div className="reader-header">
        <button
          className="icon-btn"
          onClick={handleBackClick}
        >
          ←
        </button>
        <h2>
          {story.emoji} {story.title}
        </h2>
      </div>
      <div className="reader-content">
        <SceneIllustration genre={story.genre} pageIdx={pageIdx} />
        <div className="page-title">{page[0]}</div>
        <div className="story-text">
          {tw.map((w, i) => (
            <span
              key={i}
              className={`word ${speech.speaking && i === speech.wordIndex ? "active" : ""}`}
            >
              {w}{" "}
            </span>
          ))}
        </div>
      </div>
      <div className="reader-controls">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((pageIdx + 1) / pages.length) * 100}%` }}
          />
        </div>
        <div className="controls-row">
          <button
            className="ctrl-btn"
            disabled={pageIdx === 0}
            onClick={() => {
              speech.stop();
              setPageIdx((p) => p - 1);
            }}
          >
            ⏮
          </button>
          <button
            className="ctrl-btn play"
            onClick={() => {
              if (speech.speaking) speech.stop();
              else readPage();
            }}
          >
            {speech.speaking ? "⏸" : "▶️"}
          </button>
          <button
            className="ctrl-btn"
            onClick={() => {
              speech.stop();
              if (pageIdx >= pages.length - 1) setFinished(true);
              else setPageIdx((p) => p + 1);
            }}
          >
            ⏭
          </button>
        </div>
      </div>
    </div>
  );
}
