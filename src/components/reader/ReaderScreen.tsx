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
  const [aiImages, setAiImages] = useState<(string | null)[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const pages = story.pages;
  const page = pages[pageIdx];
  const canSave = !!story.generated && !!onSave;

  // Load AI illustrations — pre-generated for built-in stories, on-demand for AI stories
  useEffect(() => {
    let cancelled = false;

    // For built-in stories, check pre-generated images
    if (!story.generated) {
      import("@/data/storyImages.json")
        .then((mod) => {
          const imageMap = mod.default as Record<string, (string | null)[]>;
          if (!cancelled && imageMap[story.id]) {
            setAiImages(imageMap[story.id]);
          }
        })
        .catch(() => {}); // File may not exist yet
      return () => { cancelled = true; };
    }

    // For AI-generated stories, generate on-demand
    if (!story.fullPages || story.fullPages.length === 0) return;
    const scenesExist = story.fullPages.some((p) => p.scene);
    if (!scenesExist) return;

    setImagesLoading(true);

    fetch("/api/generate-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pages: story.fullPages.map((p) => ({
          scene: p.scene || "",
          mood: p.mood || "warm",
        })),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.images) {
          setAiImages(data.images);
        }
      })
      .catch((err) => console.warn("Failed to load AI illustrations:", err))
      .finally(() => { if (!cancelled) setImagesLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id]);

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
        {aiImages[pageIdx] ? (
          <div className="ai-illustration">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aiImages[pageIdx]!} alt={`Illustration for ${page[0]}`} />
            {imagesLoading && <div className="img-loading-dot" />}
          </div>
        ) : (
          <SceneIllustration genre={story.genre} pageIdx={pageIdx} />
        )}
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
