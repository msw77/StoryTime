"use client";

import { useState, useEffect } from "react";
import { BUILDER_GENRES, AGE_GROUPS, HERO_TYPES, LESSONS, DURATIONS } from "@/data/genres";
import type { GenerateStoryFormValues } from "@/lib/generateStory";

interface BuilderScreenProps {
  onBack: () => void;
  /** Kick off generation on the parent, which owns the async lifecycle
   *  so the work can survive navigation away from the LoadingScreen. */
  onStartGeneration: (form: GenerateStoryFormValues) => void;
  /** When true, a previous generation is still running in the
   *  background (detached). We block starting a new one and show a
   *  hint on the Create button. */
  backgroundBusy?: boolean;
}

export function BuilderScreen({ onBack, onStartGeneration, backgroundBusy = false }: BuilderScreenProps) {
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
  const [error, setError] = useState("");

  const availableDurations =
    age === "2-4" ? DURATIONS.filter((d) => d.minutes <= 5) : DURATIONS;

  useEffect(() => {
    if (!availableDurations.find((d) => d.id === duration))
      setDuration(availableDurations[0].id);
  }, [age]);

  const handleCreate = () => {
    if (backgroundBusy) {
      setError("Another story is still generating in the background — wait for the ding before starting a new one.");
      return;
    }
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

    const finalLesson = lesson === "Write my own…" ? customLesson : lesson;
    // Preset hero types carry an emoji prefix ("🐱 Cat") that we strip;
    // custom types are taken verbatim.
    const heroTypeClean = isCustomHero
      ? customHeroType.trim()
      : heroType.split(" ").slice(1).join(" ");

    // Hand off everything to the parent. The parent owns the promise,
    // the LoadingScreen, the detach flow, and the final navigation.
    onStartGeneration({
      heroName: heroName.trim().charAt(0).toUpperCase() + heroName.trim().slice(1),
      heroTypeClean,
      obstacle,
      genre, // parent will resolve "random" to a concrete id
      age,
      duration,
      finalLesson,
      extras,
    });
  };

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
        style={{
          width: "100%",
          padding: 16,
          fontSize: 18,
          opacity: backgroundBusy ? 0.6 : 1,
        }}
        onClick={handleCreate}
        disabled={backgroundBusy}
      >
        {backgroundBusy ? "⏳ A story is already cooking…" : "✨ Create My Story!"}
      </button>
      {backgroundBusy && (
        <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginTop: 8, fontWeight: 600 }}>
          You&apos;ll hear a ding when it&apos;s ready.
        </p>
      )}
    </div>
  );
}
