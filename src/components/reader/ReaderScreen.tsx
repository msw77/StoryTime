"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Story, SpeechControls } from "@/types/story";
import { SoundEffects } from "@/hooks/useSoundEffects";
import { SceneIllustration } from "./SceneIllustration";

interface ReaderScreenProps {
  story: Story;
  onBack: () => void;
  speech: SpeechControls;
  sfx: SoundEffects;
  onSave?: () => void;
}

export function ReaderScreen({ story, onBack, speech, sfx, onSave }: ReaderScreenProps) {
  const [pageIdx, setPageIdx] = useState(0);
  const [rating, setRating] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const [aiImages, setAiImages] = useState<(string | null)[]>(
    () => story.preloadedImages || []
  );
  const [imageIsWide, setImageIsWide] = useState<Record<number, boolean>>({});
  const [imagesLoading, setImagesLoading] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [pageTransition, setPageTransition] = useState<"in" | "out" | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pages = story.pages;
  const page = pages[pageIdx];
  const canSave = !!story.generated && !!onSave;

  // Animated page change — fade out, switch, fade in
  const goToPage = useCallback((newPage: number, isAutoAdvance = false) => {
    if (newPage === pageIdx || newPage < 0 || newPage >= pages.length) return;

    // Cancel any in-flight transition
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    // Always stop current audio immediately to prevent overlap
    speech.stop();

    // Set auto-advance flag — reset to false for manual nav so the effect
    // takes the right path (manual nav that already had stop() called)
    autoAdvancedRef.current = isAutoAdvance;

    sfx.pageTurn();
    setPageTransition("out");
    transitionTimerRef.current = setTimeout(() => {
      setPageIdx(newPage);
      setPageTransition("in");
      transitionTimerRef.current = setTimeout(() => setPageTransition(null), 400);
    }, 200);
  }, [pageIdx, pages.length, sfx, speech]);

  // Set reading speed based on age group when story opens
  useEffect(() => {
    const ageSpeed = story.age === "2-4" ? 0.85 : story.age === "4-7" ? 0.92 : 1.0;
    speech.setAiSpeed(ageSpeed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id]);

  // Helper: fetch images for specific page indices
  const fetchImages = async (
    pageIndices: number[],
    fullPages: NonNullable<typeof story.fullPages>,
    charDesc: string,
  ) => {
    const res = await fetch("/api/generate-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pages: pageIndices.map((i) => ({
          scene: fullPages[i]?.scene || "",
          mood: fullPages[i]?.mood || "warm",
          index: i,
        })),
        characterDescription: charDesc,
      }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    return data.images as { index: number; url: string | null }[];
  };

  // Load AI illustrations — pre-generated for built-in, progressive for AI stories
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
        .catch(() => {});
      return () => { cancelled = true; };
    }

    // For AI-generated stories, generate progressively
    if (!story.fullPages || story.fullPages.length === 0) return;
    const scenesExist = story.fullPages.some((p) => p.scene);
    if (!scenesExist) return;

    const totalPages = story.fullPages.length;
    const charDesc = story.characterDescription || "";
    const preloaded = story.preloadedImages || [];

    // Initialize with any pre-loaded images from the builder
    if (preloaded.length > 0) {
      setAiImages((prev) => {
        const next = new Array(totalPages).fill(null);
        for (let i = 0; i < Math.min(preloaded.length, totalPages); i++) {
          next[i] = preloaded[i] || prev[i] || null;
        }
        return next;
      });
    } else {
      setAiImages(new Array(totalPages).fill(null));
    }

    // Figure out which pages still need images
    const needsImage = Array.from({ length: totalPages }, (_, i) => i)
      .filter((i) => !preloaded[i]);

    if (needsImage.length === 0) return; // All pre-loaded!

    setImagesLoading(true);

    const run = async () => {
      try {
        // Load remaining pages in batches of 3
        for (let i = 0; i < needsImage.length; i += 3) {
          if (cancelled) return;
          const batch = needsImage.slice(i, i + 3);
          const results = await fetchImages(batch, story.fullPages!, charDesc);
          if (cancelled) return;

          setAiImages((prev) => {
            const next = [...prev];
            for (const img of results) {
              if (img.url) next[img.index] = img.url;
            }
            return next;
          });
        }
      } catch (err) {
        console.warn("Image generation error:", err);
      } finally {
        if (!cancelled) setImagesLoading(false);
      }
    };

    run();
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

  // Track whether the page change was triggered by autoplay (audio ending)
  const autoAdvancedRef = useRef(false);
  const pageIdxRef = useRef(pageIdx);
  pageIdxRef.current = pageIdx;

  const readPage = () => {
    const sid = story.generated ? undefined : story.id;
    const idx = pageIdxRef.current;
    speech.setStoryContext(sid, idx);
    speech.speak(pages[idx][1], () => {
      // Audio finished — advance to next page
      if (idx < pages.length - 1) {
        goToPage(idx + 1, true);
      } else {
        setFinished(true); sfx.celebration();
      }
    });
  };

  // Pre-fetch audio for the current page (and next page) as soon as the page displays
  useEffect(() => {
    const sid = story.generated ? undefined : story.id;
    speech.setStoryContext(sid, pageIdx);
    speech.prefetch(pages[pageIdx][1], sid, pageIdx);
    if (pageIdx < pages.length - 1) {
      speech.prefetch(pages[pageIdx + 1][1], sid, pageIdx + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx]);

  // When page changes: if auto-advanced from audio ending, start next page.
  // If manually navigated, goToPage already called speech.stop().
  useEffect(() => {
    const wasAutoAdvance = autoAdvancedRef.current;
    autoAdvancedRef.current = false;

    if (!autoplay || finished) return;

    // Auto-advance: audio just finished, start next page after brief pause
    // Manual nav: goToPage already stopped audio, start new page after longer pause
    const delay = wasAutoAdvance ? 600 : 800;
    const timer = setTimeout(() => readPage(), delay);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx]);

  // Auto-scroll to keep the highlighted word visible
  useEffect(() => {
    if (speech.wordIndex < 0 || !speech.speaking) return;
    const activeEl = contentRef.current?.querySelector(".word.active") as HTMLElement | null;
    if (!activeEl || !contentRef.current) return;

    const container = contentRef.current;
    const containerRect = container.getBoundingClientRect();
    const wordRect = activeEl.getBoundingClientRect();

    // Word position relative to the visible container area
    const wordTopInContainer = wordRect.top - containerRect.top;
    const wordBottomInContainer = wordRect.bottom - containerRect.top;

    // If word is below the visible area or above it, scroll to center it
    if (wordBottomInContainer > containerRect.height - 30 || wordTopInContainer < 30) {
      const scrollTarget = container.scrollTop + wordTopInContainer - containerRect.height * 0.5;
      container.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });
    }
  }, [speech.wordIndex, speech.speaking]);

  // Scroll to top when page changes
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pageIdx]);

  // Preload the next 1-2 page images into browser cache so the image swap
  // is instant when turning the page.
  useEffect(() => {
    const toPreload = [pageIdx + 1, pageIdx + 2];
    toPreload.forEach((i) => {
      const url = aiImages[i];
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [pageIdx, aiImages]);

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
                onClick={() => { setRating(n); sfx.starTap(n - 1); }}
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
        <button className="icon-btn" onClick={handleBackClick}>←</button>
        <h2>{story.emoji} {story.title}</h2>
        <span className="page-num">{pageIdx + 1}/{pages.length}</span>
        <div className="header-controls">
          <button
            className="hdr-btn"
            disabled={pageIdx === 0}
            onClick={() => { speech.stop(); goToPage(pageIdx - 1); }}
          >
            ⏮
          </button>
          <button
            className="hdr-btn play"
            disabled={speech.loading}
            onClick={() => {
              if (speech.speaking) { sfx.tap(); speech.stop(); }
              else { readPage(); }
            }}
          >
            {speech.loading ? "⏳" : speech.speaking ? "⏸" : "▶️"}
          </button>
          <button
            className="hdr-btn"
            onClick={() => {
              speech.stop();
              if (pageIdx >= pages.length - 1) { setFinished(true); sfx.celebration(); }
              else goToPage(pageIdx + 1);
            }}
          >
            ⏭
          </button>
          <button
            className={`hdr-btn ${autoplay ? "active" : ""}`}
            onClick={() => setAutoplay((a) => !a)}
            title={autoplay ? "Autoplay on" : "Autoplay off"}
          >
            {autoplay ? "🔁" : "➡️"}
          </button>
        </div>
      </div>
      <div className="reader-progress">
        <div
          className="progress-fill"
          style={{ width: `${pages.length <= 1 ? 100 : (pageIdx / (pages.length - 1)) * 100}%` }}
        />
      </div>
      <div className={`reader-body ${pageTransition === "out" ? "page-exit" : pageTransition === "in" ? "page-enter" : ""}`}>
        <div className="reader-image-fixed">
          {aiImages[pageIdx] ? (
            <div className={`ai-illustration ${imageIsWide[pageIdx] ? "wide" : ""}`} key={pageIdx}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={aiImages[pageIdx]!}
                alt={`Illustration for ${page[0]}`}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  const ratio = img.naturalWidth / img.naturalHeight;
                  // Wider than 3:2 (1.5) — e.g., 16:9 images get the wide treatment
                  const isWide = ratio > 1.6;
                  setImageIsWide((prev) =>
                    prev[pageIdx] === isWide ? prev : { ...prev, [pageIdx]: isWide }
                  );
                }}
              />
            </div>
          ) : imagesLoading && story.generated ? (
            <div className="ai-illustration img-shimmer">
              <div className="shimmer-text">🎨 Painting this scene…</div>
            </div>
          ) : (
            <SceneIllustration genre={story.genre} pageIdx={pageIdx} />
          )}
        </div>
        <div ref={contentRef} className="reader-text-scroll">
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
      </div>
    </div>
  );
}
