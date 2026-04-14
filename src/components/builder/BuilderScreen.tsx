"use client";

import { useState, useEffect } from "react";
import { Story } from "@/types/story";
import { GENRES, BUILDER_GENRES, REAL_GENRES, AGE_GROUPS, HERO_TYPES, LESSONS, DURATIONS } from "@/data/genres";
import { generateStoryOffline } from "@/lib/storyEngine";
import { prefetchStoryAudio } from "@/hooks/useSpeech";
import { LoadingScreen } from "./LoadingScreen";

interface BuilderScreenProps {
  onBack: () => void;
  onStoryCreated: (story: Story) => void;
}

export function BuilderScreen({ onBack, onStoryCreated }: BuilderScreenProps) {
  const [heroName, setHeroName] = useState("");
  const [heroType, setHeroType] = useState(HERO_TYPES[0]);
  const [customHeroType, setCustomHeroType] = useState("");
  const [obstacle, setObstacle] = useState("");
  const [genre, setGenre] = useState("adventure");
  const [age, setAge] = useState("4-7");
  const [duration, setDuration] = useState("5");
  const [lesson, setLesson] = useState("Be brave");
  const [customLesson, setCustomLesson] = useState("");
  const [extras, setExtras] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"story" | "illustrations">("story");
  const [loadingProgress, setLoadingProgress] = useState(0); // 0-100
  const [error, setError] = useState("");

  const availableDurations =
    age === "2-4" ? DURATIONS.filter((d) => d.minutes <= 5) : DURATIONS;

  useEffect(() => {
    if (!availableDurations.find((d) => d.id === duration))
      setDuration(availableDurations[0].id);
  }, [age]);

  const handleCreate = async () => {
    if (!heroName.trim()) {
      setError("Give your hero a name!");
      return;
    }
    const isCustomHero = heroType === "✏️ Other…";
    if (isCustomHero && !customHeroType.trim()) {
      setError("Type what kind of hero (e.g. turtle, penguin, wizard).");
      return;
    }
    setError("");
    setLoading(true);
    setLoadingPhase("story");

    const finalLesson = lesson === "Write my own…" ? customLesson : lesson;
    // For preset hero types (e.g. "🐱 Cat"), strip the emoji prefix.
    // For custom types, send the user's text verbatim.
    const heroTypeClean = isCustomHero
      ? customHeroType.trim()
      : heroType.split(" ").slice(1).join(" ");
    // Resolve "random" to an actual genre so the API gets a real value and
    // the saved story ends up tagged with whatever genre was rolled.
    const resolvedGenre =
      genre === "random"
        ? REAL_GENRES[Math.floor(Math.random() * REAL_GENRES.length)].id
        : genre;
    const gc = GENRES.find((g) => g.id === resolvedGenre);

    // Phase timing — helps diagnose which external service is slow.
    // View in browser DevTools console. Format: [StoryTime] phase: Xs
    const t0 = performance.now();
    const mark = (label: string) => {
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      console.log(`[StoryTime] ${label}: ${secs}s`);
    };

    try {
      // ── Phase 1: Claude story text ───────────────────────────────────
      mark("story generation started");
      const res = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroName: heroName.trim(),
          heroType: heroTypeClean,
          genre: resolvedGenre,
          age,
          obstacle,
          lesson: finalLesson,
          extras,
          duration,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "AI generation failed");
      }

      const data = await res.json();
      mark("story text received");

      // ── Phase 2: page 1 illustration only ───────────────────────────
      // Previously we pre-generated half the story's images before opening
      // the reader. That blocked the user on 3+ slow image calls when really
      // they only need page 1 to start reading. The reader's existing
      // progressive loader generates pages 2+ in the background while the
      // user reads page 1, so pre-loading them here is pure dead time.
      setLoadingPhase("illustrations");
      setLoadingProgress(50);

      const totalPages = data.pages.length;
      const preloadedImages: (string | null)[] = new Array(totalPages).fill(null);

      if (data.fullPages && data.fullPages.length > 0 && data.fullPages[0]?.scene) {
        const charDesc = data.characterDescription || "";
        try {
          const imgRes = await fetch("/api/generate-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pages: [{
                scene: data.fullPages[0].scene,
                mood: data.fullPages[0].mood || "warm",
                index: 0,
              }],
              characterDescription: charDesc,
            }),
          });
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            for (const img of imgData.images) {
              if (img.url) preloadedImages[img.index] = img.url;
            }
          }
        } catch (imgErr) {
          console.warn("Page 1 image failed:", imgErr);
        }
      }
      setLoadingProgress(85);
      mark("page 1 illustration done");

      const story: Story = {
        id: "ai_" + Date.now(),
        title: data.title,
        emoji: data.emoji || "✨",
        color: gc?.color || "#6366f1",
        genre: resolvedGenre,
        age,
        pages: data.pages,
        fullPages: data.fullPages,
        generated: true,
        duration,
        characterDescription: data.characterDescription || "",
        preloadedImages,
      };

      // ── Phase 3: warm page 1 audio ───────────────────────────────────
      // Wait for the audio to be fully decoded and ready to play with zero
      // latency. No cap — we're already waiting on a ~35s image, so a few
      // extra seconds for audio is worth it for truly instant playback.
      // If the TTS call fails entirely, the helper returns quickly and the
      // reader will fall back to browser voice on play.
      setLoadingProgress(98);
      if (Array.isArray(data.pages) && data.pages.length > 0) {
        const pageTexts = (data.pages as [string, string][]).map((p) => p[1]);
        await prefetchStoryAudio(pageTexts, undefined, { maxPages: 1 });
      }
      setLoadingProgress(100);
      mark("audio warmed, opening reader");

      onStoryCreated(story);
    } catch (aiError) {
      console.warn("AI generation failed, falling back to offline engine:", aiError);
      // Fall back to offline story engine
      try {
        const result = generateStoryOffline({
          heroName: heroName.trim(),
          heroType: heroTypeClean,
          obstacle,
          genre: resolvedGenre,
          age,
          lesson: finalLesson,
          duration,
        });
        const story: Story = {
          id: "gen_" + Date.now(),
          title: result.title,
          emoji: result.emoji || "✨",
          color: gc?.color || "#6366f1",
          genre: resolvedGenre,
          age,
          pages: result.pages,
          generated: true,
          duration,
        };
        onStoryCreated(story);
      } catch (offlineError) {
        setError("Failed: " + (offlineError as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingScreen genre={genre} heroName={heroName.trim() || undefined} phase={loadingPhase} progress={loadingProgress} />;
  }

  return (
    <div className="builder">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="icon-btn" onClick={onBack}>←</button>
        <h2>✨ Create a Story</h2>
      </div>
      <div className="safety-note">🛡️ All stories are kid-safe and age-appropriate.</div>
      {error && <div className="error-msg">{error}</div>}

      <div className="builder-section">
        <label>Hero&apos;s Name</label>
        <input
          type="text"
          placeholder="e.g. Luna, Max, Captain Sparkle…"
          value={heroName}
          onChange={(e) => setHeroName(e.target.value)}
        />
      </div>

      <div className="builder-section">
        <label>Hero Type</label>
        <div className="pill-row">
          {HERO_TYPES.map((h) => (
            <button
              key={h}
              className={`pill ${heroType === h ? "active" : ""}`}
              style={heroType === h ? { background: "var(--accent)" } : {}}
              onClick={() => setHeroType(h)}
            >
              {h}
            </button>
          ))}
        </div>
        {heroType === "✏️ Other…" && (
          <input
            type="text"
            placeholder="e.g. turtle, penguin, wizard, tiny alien…"
            style={{ marginTop: 8 }}
            value={customHeroType}
            onChange={(e) => setCustomHeroType(e.target.value)}
          />
        )}
      </div>

      <div className="builder-section">
        <label>Obstacle / Challenge (optional)</label>
        <input
          type="text"
          placeholder="e.g. a big storm, a lost friend…"
          value={obstacle}
          onChange={(e) => setObstacle(e.target.value)}
        />
      </div>

      <div className="builder-section">
        <label>Genre</label>
        <div className="pill-row">
          {BUILDER_GENRES.map((g) => (
            <button
              key={g.id}
              className={`pill ${genre === g.id ? "active" : ""}`}
              style={genre === g.id ? { background: g.color } : {}}
              onClick={() => setGenre(g.id)}
            >
              {g.emoji} {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-section">
        <label>Reading Level</label>
        <div className="pill-row">
          {AGE_GROUPS.map((a) => (
            <button
              key={a.id}
              className={`pill ${age === a.id ? "active" : ""}`}
              style={age === a.id ? { background: "var(--accent2)" } : {}}
              onClick={() => setAge(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-section">
        <label>Story Length</label>
        <div className="pill-row">
          {availableDurations.map((d) => (
            <button
              key={d.id}
              className={`pill ${duration === d.id ? "active" : ""}`}
              style={duration === d.id ? { background: "#e67e22" } : {}}
              onClick={() => setDuration(d.id)}
            >
              <span style={{ display: "block", lineHeight: 1.3 }}>
                {d.label}
                <br />
                <span style={{ fontSize: 11, opacity: 0.85 }}>{d.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="builder-section">
        <label>Lesson / Moral</label>
        <select value={lesson} onChange={(e) => setLesson(e.target.value)}>
          {LESSONS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {lesson === "Write my own…" && (
          <input
            type="text"
            placeholder="Type your lesson…"
            style={{ marginTop: 8 }}
            value={customLesson}
            onChange={(e) => setCustomLesson(e.target.value)}
          />
        )}
      </div>

      <div className="builder-section">
        <label>Extra Details (optional)</label>
        <textarea
          placeholder="e.g. set in space, hero loves pizza…"
          value={extras}
          onChange={(e) => setExtras(e.target.value)}
        />
      </div>

      <button
        className="pill-btn primary"
        style={{ width: "100%", padding: 16, fontSize: 18 }}
        onClick={handleCreate}
      >
        ✨ Create My Story!
      </button>
    </div>
  );
}
