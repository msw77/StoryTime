"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { Story, SpeechControls } from "@/types/story";
import { SoundEffects } from "@/hooks/useSoundEffects";
import { hydrateStoredAudio } from "@/hooks/useSpeech";
import { SceneIllustration } from "./SceneIllustration";
import { useWordMoments } from "@/hooks/useWordMoments";
import { HighlightDebugOverlay } from "./HighlightDebugOverlay";
import { enableDiagnostics } from "@/lib/highlightDiagnostics";
import { VocabWordModal } from "./VocabWordModal";
import { ComprehensionQuestionsScreen } from "./ComprehensionQuestionsScreen";
import type { VocabWord } from "@/types/story";

// ── Memoized single-word render ──────────────────────────────────────
// Why this exists: on every RAF tick during narration, useSpeech bumps
// speech.wordIndex. That triggers a ReaderScreen re-render, which in
// turn re-invokes tw.map(...), producing ~100 JSX elements 60 times a
// second. React will diff each span against the prior tree to figure
// out that only 2 children's className actually changed (the outgoing
// active word and the incoming one) — but the diff itself still costs
// work for all 100 children on every tick. Parents reported the result
// as a "shuttery" highlight.
//
// Wrapping the word in React.memo with primitive props means React
// skips rendering 98 out of 100 words per tick (shallow-equal props).
// Only the two whose isActive actually changes do render work. That
// plus the CSS cleanup (no scale transform, single-property
// transition) is what makes the highlight feel silky.
//
// Prop stability rules we rely on:
//   - text, isActive, effect, wordIdx are primitives → always stable
//   - vocab is a ref from useMemo → stable while page doesn't change
//   - onVocabTap is a useCallback from the parent → stable while its
//     deps don't change (which they don't mid-page)
const Word = memo(function Word({
  text,
  wordIdx,
  isActive,
  effect,
  vocab,
  onVocabTap,
}: {
  text: string;
  wordIdx: number;
  isActive: boolean;
  effect: string | undefined;
  vocab: VocabWord | null;
  onVocabTap: (vocab: VocabWord, wordIdx: number) => void;
}) {
  const classes =
    "word" +
    (isActive ? " active" : "") +
    (effect ? ` word-fx word-fx-${effect}` : "") +
    (vocab ? " vocab-word" : "");

  if (!vocab) {
    // Fast path — no handlers, no a11y affordances, just a plain span.
    // Skipping the role/tabIndex/onClick props shaves a few bytes of
    // attribute diffing per non-vocab word on each render.
    return <span className={classes}>{text}{" "}</span>;
  }

  return (
    <span
      className={classes}
      role="button"
      tabIndex={0}
      onClick={() => onVocabTap(vocab, wordIdx)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onVocabTap(vocab, wordIdx);
        }
      }}
      aria-label={`${text.replace(/[^\w']/g, "")} — tap for definition`}
    >
      {text}{" "}
    </span>
  );
});

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
  /** Active child profile id, used to attribute Word Glow taps, reading
   *  history, and future per-kid analytics. Null when no profile is
   *  selected (guest/dev-bypass mode) — in that case analytics writes
   *  are skipped entirely. */
  childProfileId?: string | null;
  /** Parent preference: show Science-of-Reading comprehension questions
   *  after each story (age 4+). Default true. When false the reader
   *  jumps straight to the celebration/save/back-to-library flow. */
  comprehensionEnabled?: boolean;
}

export function ReaderScreen({
  story,
  onBack,
  speech,
  sfx,
  onSave,
  effectsEnabled = true,
  childProfileId = null,
  comprehensionEnabled = true,
}: ReaderScreenProps) {
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

  // Word Glow — vocabulary modal state. Null when closed. When a child
  // taps a vocab-flagged word, we pause narration and open the modal;
  // dismiss resumes narration where it left off. See VocabWordModal.
  const [activeVocab, setActiveVocab] = useState<VocabWord | null>(null);

  // Story Questions — tracks whether we still owe the child the
  // comprehension screen. Set to true when the story finishes AND the
  // story has questions AND the parent has the feature on. Cleared to
  // false when the child answers the last question or taps Skip. Only
  // used inside the `finished` branch below.
  const hasComprehension =
    comprehensionEnabled &&
    Array.isArray(story.comprehensionQuestions) &&
    story.comprehensionQuestions.length > 0;
  const [comprehensionShown, setComprehensionShown] = useState(false);
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

  // Word Glow hooks — MUST be declared here, above ALL early returns
  // below (showLeavePrompt, finished, etc.) so React sees the same
  // hook count on every render. If they live further down, the
  // finished=true path renders fewer hooks than the normal path and
  // React throws "Rendered fewer hooks than expected". (Same reason
  // effectsForWord lives up here — see the comment above.)
  const vocabForWordAt = useMemo(() => {
    const pageText = page?.[1] ?? "";
    const words = pageText.split(/\s+/);
    const list = story.fullPages?.[pageIdx]?.vocabWords ?? [];
    if (list.length === 0) return (_i: number) => null as VocabWord | null;
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/gi, "");
    const byKey = new Map<string, VocabWord>();
    for (const v of list) byKey.set(clean(v.word), v);
    return (i: number): VocabWord | null => {
      const w = words[i];
      if (!w) return null;
      return byKey.get(clean(w)) ?? null;
    };
  }, [story, pageIdx, page]);

  // Word Glow tap handler — opens modal, pauses narrator, fires the
  // analytics write. Fire-and-forget network call so flaky connections
  // never break the tap UX. Skipped when no active profile (guest mode).
  const openVocabModal = useCallback(
    (vocab: VocabWord, wordIdx: number) => {
      sfx.tap();
      speech.pause();
      setActiveVocab(vocab);

      if (!childProfileId) return;
      const cleanWord = vocab.word.toLowerCase().replace(/[^a-z0-9']/gi, "");
      void fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childProfileId,
          word: cleanWord,
          storyId: story.id,
          pageIdx,
        }),
      }).catch(() => { /* analytics should never break UX */ });
      void wordIdx;
    },
    [sfx, speech, childProfileId, story.id, pageIdx],
  );

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
    // Science-of-Reading Pillar 5: between last page and celebration,
    // serve 2-3 warm comprehension questions if the story has them
    // and the parent has the feature on. The child can skip at any
    // point — skipping still saves them back to the celebration,
    // which still offers Save-to-Library / Read Again / Back to
    // Library exactly as before.
    if (hasComprehension && !comprehensionShown) {
      return (
        <ComprehensionQuestionsScreen
          questions={story.comprehensionQuestions!}
          storyId={story.id}
          childProfileId={childProfileId}
          onTap={sfx.tap}
          onComplete={() => setComprehensionShown(true)}
        />
      );
    }
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

  // Sound It Out was removed 2026-04-18 after parent testing found the
  // TTS-per-syllable and tap-any-word behaviors janky and confusing.
  // Whole-word TTS in isolation sounds wrong without sentence prosody,
  // and per-syllable TTS ("can" + "yon") doesn't reproduce the way a
  // teacher segments phonemes. We can revisit with phoneme-level audio
  // or pre-recorded syllable assets later. For now, the tap gesture is
  // scoped strictly to vocab words → definition modal. Every other
  // word is non-interactive, matching the reader's prior behavior.

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
               use, just not rendered here.

               Word Glow — Science-of-Reading vocabulary feature. Each
               word whose "cleaned" form matches an entry in this page's
               fullPages[pageIdx].vocabWords gets a subtle dotted
               underline and becomes tappable. Tapping pauses the
               narrator and opens VocabWordModal. Age-2-4 stories
               typically have no vocabWords (definitions are skipped),
               so this is a no-op there. */}
          <div
            className={`story-text ${story.age === "2-4" ? "story-text--young" : ""}`}
          >
            {tw.map((w, i) => (
              <Word
                key={i}
                text={w}
                wordIdx={i}
                isActive={speech.speaking && i === speech.wordIndex}
                effect={effectsForWord[i]}
                vocab={vocabForWordAt(i)}
                onVocabTap={openVocabModal}
              />
            ))}
          </div>
        </div>
      </div>
      {debugHighlight && <HighlightDebugOverlay />}
      {activeVocab && (
        <VocabWordModal
          word={activeVocab}
          ageBand={story.age}
          onDismiss={() => {
            setActiveVocab(null);
            speech.resume();
          }}
          // Speaker button + Sound It Out both removed 2026-04-18.
          // See the comment near openVocabModal for rationale.
        />
      )}
    </div>
  );
}
