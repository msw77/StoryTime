"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Story, SpeechControls } from "@/types/story";
import { SoundEffects } from "@/hooks/useSoundEffects";
import { hydrateStoredAudio } from "@/hooks/useSpeech";
import { SceneIllustration } from "./SceneIllustration";
import { useWordMoments } from "@/hooks/useWordMoments";
import { HighlightDebugOverlay } from "./HighlightDebugOverlay";
import { enableDiagnostics } from "@/lib/highlightDiagnostics";

interface ReaderScreenProps {
  story: Story;
  onBack: () => void;
  speech: SpeechControls;
  sfx: SoundEffects;
  /** Called when the user saves this generated story to their library.
   *  Receives the currently-loaded image URLs so they can be persisted
   *  alongside the story text (so future opens don't regenerate images).
   *  Returns a Promise — the server generates TTS audio for every page
   *  during save, so callers should await this to show accurate UI state. */
  onSave?: (imageUrls: (string | null)[]) => void | Promise<void>;
  /** Master "audio & visual effects" preference from the parent settings
   *  modal. When false, disables Ken Burns pan on illustrations, the 3D
   *  page-flip (falls back to a flat fade), and — once Sprint 2 lands —
   *  ambient sound beds + inline SFX cues. Defaults to true if unset. */
  effectsEnabled?: boolean;
}

export function ReaderScreen({ story, onBack, speech, sfx, onSave, effectsEnabled = true }: ReaderScreenProps) {
  // Word-highlight diagnostics (Phase 0). Opt-in via ?hl=1 in the URL so
  // it never costs anything in normal use but is one query-param away when
  // we're tuning alignment. See src/lib/highlightDiagnostics.ts for the
  // full rationale; tl;dr this shows live drift + lets us export a CSV
  // of per-word timing data for analysis.
  const [debugHighlight, setDebugHighlight] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("hl") === "1") {
      enableDiagnostics();
      setDebugHighlight(true);
    }
  }, []);

  const [pageIdx, setPageIdx] = useState(0);
  const [rating, setRating] = useState(0);
  const [finished, setFinished] = useState(false);
  // Cozy mode: warm sepia dim + radial vignette + candle-glow highlight.
  // One-tap toggle in the reader header. Persists for the duration of
  // this reader session only (intentional — a parent might want it for
  // bedtime stories but not the daytime read). In Sprint 2 this state
  // will also gate the looping fireplace-crackle ambient audio.
  const [cozy, setCozy] = useState(false);
  // A story loaded from the library already lives in the DB — its id is a
  // DB UUID, not the "ai_<timestamp>" marker we assign to freshly-generated
  // stories. Treat it as already saved so we don't prompt to save on close
  // (which would create a duplicate row).
  const [saved, setSaved] = useState(() => !story.id.startsWith("ai_"));
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

  // Set reading speed based on age group when story opens. Older kids
  // read along faster and prefer a livelier tempo; younger kids need more
  // time per word to track the highlight. Parents can override via the
  // speed chip in the reader header at any time.
  useEffect(() => {
    const ageSpeed = story.age === "2-4" ? 0.9 : story.age === "4-7" ? 1.0 : 1.1;
    speech.setAiSpeed(ageSpeed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id]);

  // Seed the audio cache with any persisted audio URLs + word timings saved
  // for this story. After this runs, speech.speak() will find cache hits on
  // every page that has stored audio and play directly from Supabase Storage
  // without calling /api/tts. No-op if the story has no persisted audio.
  useEffect(() => {
    if (!story.audioUrls || !story.wordTimings) return;
    const pagesPayload = story.pages.map((p, i) => ({
      text: p[1],
      url: story.audioUrls?.[i] ?? null,
      wordTimings: story.wordTimings?.[i] ?? null,
    }));
    hydrateStoredAudio(pagesPayload);
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
        // Pass the hero's species/form so the image layer can reinforce
        // it with a top-level SUBJECT directive. Undefined for stories
        // saved before heroType was persisted — the image layer simply
        // skips the extra line in that case.
        heroType: story.heroType,
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

  // `saving` here means "the background audio upload is still in flight".
  // The story row itself is saved optimistically, so `saved` flips to true
  // immediately and the user can leave right away without blocking on TTS.
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!onSave || saved) return;
    // Optimistic: mark saved right away so the button updates, the leave
    // prompt disappears, and the parent adds this story to "My Stories"
    // without waiting for the server-side audio generation to finish.
    setSaved(true);
    setSaving(true);
    try {
      await Promise.resolve(onSave(aiImages));
    } catch (err) {
      console.error("Save failed:", err);
      // Roll back if the save actually errored out
      setSaved(false);
    } finally {
      setSaving(false);
    }
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

    // Auto-advance: hold on the finished page for a beat before starting
    // the next one. Scaled by age group — younger kids need time to
    // process the last sentence and look at the illustration, older
    // readers prefer a snappier pace. Manual nav is always quick since
    // the user just tapped next themselves.
    const autoAdvanceDelay =
      story.age === "2-4" ? 1400 :
      story.age === "4-7" ? 1000 :
      800;
    const delay = wasAutoAdvance ? autoAdvanceDelay : 800;
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

  // Word-level effects + diegetic sound playback. Fires once per word per
  // page visit when speech.wordIndex crosses the at_word marker. Returns a
  // map of wordIndex → effect name so the render loop below can apply the
  // right CSS class without tracking state itself.
  //
  // MUST be called before any early return below — otherwise when the story
  // reaches the end screen (`finished === true`) React renders one fewer
  // hook than on the previous page and throws "Rendered fewer hooks than
  // expected". Learned that the hard way.
  const effectsForWord = useWordMoments({
    moments: story.moments?.[pageIdx] ?? null,
    pageIdx,
    wordIndex: speech.wordIndex,
    speaking: speech.speaking,
    effectsEnabled,
  });

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
            <>
              <button
                className="pill-btn primary"
                onClick={handleSave}
                disabled={saved}
                style={saved ? { opacity: 0.6 } : {}}
              >
                {saved ? (saving ? "Saved ✓" : "Saved!") : "Save to My Library"}
              </button>
            </>
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

  // ── Chapter banner ────────────────────────────────────────────────
  // Medium/Long AI stories come back from Claude with a `chapterTitle`
  // set on the first page of each chapter. When the current page has a
  // chapterTitle, we render a banner above the story text that reads
  // "Chapter N · The Chapter Title". The number is derived by counting
  // how many earlier pages also have a chapterTitle (so Page 1 is
  // always Chapter 1, no off-by-one bookkeeping needed).
  const currentChapterTitle: string | null = (() => {
    const t = story.fullPages?.[pageIdx]?.chapterTitle;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  })();
  const currentChapterNumber: number = (() => {
    if (!currentChapterTitle || !story.fullPages) return 0;
    let n = 0;
    for (let i = 0; i <= pageIdx; i++) {
      const t = story.fullPages[i]?.chapterTitle;
      if (typeof t === "string" && t.trim()) n++;
    }
    return n;
  })();

  return (
    <div className={`reader ${cozy ? "cozy" : ""} ${effectsEnabled ? "" : "no-effects"}`}>
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
          {/* Reading-speed dropdown. Applies live via audio.playbackRate;
              for stored classic audio this changes playback speed in place.
              Default speed is age-aware (see useEffect below that sets it
              on story load). */}
          <select
            className="speed-chip"
            value={speech.aiSpeed.toFixed(2)}
            onChange={(e) => speech.setAiSpeed(+e.target.value)}
            title="Reading speed"
            aria-label="Reading speed"
          >
            <option value="0.80">0.8×</option>
            <option value="0.90">0.9×</option>
            <option value="1.00">1.0×</option>
            <option value="1.10">1.1×</option>
            <option value="1.15">1.15×</option>
          </select>
          <button
            type="button"
            role="switch"
            aria-checked={autoplay}
            className={`autoplay-toggle ${autoplay ? "on" : ""}`}
            onClick={() => setAutoplay((a) => !a)}
            title={autoplay ? "Autoplay is on — pages advance automatically" : "Autoplay is off — tap next to advance"}
          >
            <span>Auto</span>
            <span className="autoplay-toggle-track" aria-hidden="true">
              <span className="autoplay-toggle-knob" />
            </span>
          </button>
          {/* Cozy-mode toggle — warms the whole reader to a sepia bedtime
              palette. Tiny icon button so it fits next to the autoplay
              switch without crowding the header. */}
          <button
            type="button"
            className={`cozy-toggle ${cozy ? "on" : ""}`}
            onClick={() => setCozy((c) => !c)}
            title={cozy ? "Cozy mode on — tap to turn off" : "Cozy mode (bedtime palette)"}
            aria-label="Toggle cozy mode"
          >
            {cozy ? "🌙" : "☀️"}
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
          {currentChapterTitle && (
            <div className="chapter-banner" key={`ch-${pageIdx}`}>
              <div className="chapter-banner-rule" aria-hidden="true" />
              <div className="chapter-banner-number">Chapter {currentChapterNumber}</div>
              <div className="chapter-banner-title">{currentChapterTitle}</div>
              <div className="chapter-banner-divider" aria-hidden="true" />
            </div>
          )}
          {/* The sweep-underline experiment is reverted — solid highlight
               feels better given our timing accuracy. wordProgress is
               still exposed on SpeechControls for diagnostics and future
               use, just not rendered here. */}
          <div
            className={`story-text ${story.age === "2-4" ? "story-text--young" : ""}`}
          >
            {tw.map((w, i) => {
              const effect = effectsForWord[i];
              const classes = [
                "word",
                speech.speaking && i === speech.wordIndex ? "active" : "",
                effect ? `word-fx word-fx-${effect}` : "",
              ].filter(Boolean).join(" ");
              return (
                <span key={i} className={classes}>
                  {w}{" "}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      {debugHighlight && <HighlightDebugOverlay />}
    </div>
  );
}
