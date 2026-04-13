"use client";

import { useState, useEffect } from "react";
import { Story } from "@/types/story";
import { GENRES, BUILDER_GENRES, AGE_GROUPS, HERO_TYPES, LESSONS, DURATIONS } from "@/data/genres";
import { generateStoryOffline } from "@/lib/storyEngine";
import { LoadingScreen } from "./LoadingScreen";

interface BuilderScreenProps {
  onBack: () => void;
  onStoryCreated: (story: Story) => void;
}

export function BuilderScreen({ onBack, onStoryCreated }: BuilderScreenProps) {
  const [heroName, setHeroName] = useState("");
  const [heroType, setHeroType] = useState(HERO_TYPES[0]);
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
    setError("");
    setLoading(true);
    setLoadingPhase("story");

    const finalLesson = lesson === "Write my own…" ? customLesson : lesson;
    const heroTypeClean = heroType.split(" ").slice(1).join(" ");
    const gc = GENRES.find((g) => g.id === genre);

    try {
      // Try AI generation first
      const res = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroName: heroName.trim(),
          heroType: heroTypeClean,
          genre,
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

      // Switch loading screen to "painting" phase and pre-generate illustrations
      setLoadingPhase("illustrations");
      setLoadingProgress(50); // Story done = 50%

      const totalPages = data.pages.length;
      const preloadedImages: (string | null)[] = new Array(totalPages).fill(null);

      if (data.fullPages && data.fullPages.length > 0) {
        const charDesc = data.characterDescription || "";
        // Pre-load pages in batches of 2, up to half the story (at least 4 pages)
        const pagesToPreload = Math.min(totalPages, Math.max(4, Math.ceil(totalPages / 2)));
        const allIndices = Array.from({ length: pagesToPreload }, (_, i) => i);
        const batchSize = 2;
        let loaded = 0;

        for (let b = 0; b < allIndices.length; b += batchSize) {
          const batch = allIndices.slice(b, b + batchSize);
          try {
            const imgRes = await fetch("/api/generate-images", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pages: batch.map((i: number) => ({
                  scene: data.fullPages[i]?.scene || "",
                  mood: data.fullPages[i]?.mood || "warm",
                  index: i,
                })),
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
            console.warn("Image batch failed:", imgErr);
          }
          loaded += batch.length;
          // Progress: 50% for story + 50% spread across image batches
          setLoadingProgress(50 + Math.round((loaded / pagesToPreload) * 50));
        }
      }

      const story: Story = {
        id: "ai_" + Date.now(),
        title: data.title,
        emoji: data.emoji || "✨",
        color: gc?.color || "#6366f1",
        genre,
        age,
        pages: data.pages,
        fullPages: data.fullPages,
        generated: true,
        duration,
        characterDescription: data.characterDescription || "",
        preloadedImages,
      };
      onStoryCreated(story);
    } catch (aiError) {
      console.warn("AI generation failed, falling back to offline engine:", aiError);
      // Fall back to offline story engine
      try {
        const result = generateStoryOffline({
          heroName: heroName.trim(),
          heroType: heroTypeClean,
          obstacle,
          genre,
          age,
          lesson: finalLesson,
          duration,
        });
        const story: Story = {
          id: "gen_" + Date.now(),
          title: result.title,
          emoji: result.emoji || "✨",
          color: gc?.color || "#6366f1",
          genre,
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
