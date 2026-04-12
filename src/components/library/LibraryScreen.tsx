"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Story } from "@/types/story";
import { GENRES, AGE_GROUPS } from "@/data/genres";
import { PaywallCard } from "@/components/shared/PaywallCard";

interface ChildProfile {
  id: string;
  name: string;
  age: number | null;
  avatar_emoji: string;
}

interface LibraryScreenProps {
  stories: Story[];
  onSelect: (story: Story) => void;
  onCreateNew: () => void;
  setShowVoice: (show: boolean) => void;
  isPremium?: boolean;
  freeStoryLimit?: number;
  activeProfile?: ChildProfile | null;
  onSwitchProfile?: () => void;
}

export function LibraryScreen({
  stories,
  onSelect,
  onCreateNew,
  setShowVoice,
  isPremium = false,
  freeStoryLimit = 5,
  activeProfile,
  onSwitchProfile,
}: LibraryScreenProps) {
  const [gf, setGf] = useState("all");
  const [af, setAf] = useState<string | null>(null);

  const filtered = stories.filter((s) => {
    if (gf !== "all" && s.genre !== gf) return false;
    if (af && s.age !== af) return false;
    return true;
  });

  // For free users, only show the first N stories
  const visibleStories = isPremium ? filtered : filtered.slice(0, freeStoryLimit);
  const lockedCount = isPremium ? 0 : Math.max(0, filtered.length - freeStoryLimit);

  return (
    <>
      <div className="header">
        <h1>📚 StoryTime</h1>
        <div className="header-btns">
          {activeProfile && onSwitchProfile && (
            <button
              className="icon-btn"
              onClick={onSwitchProfile}
              title="Switch child profile"
              style={{ fontSize: 22 }}
            >
              {activeProfile.avatar_emoji}
            </button>
          )}
          <button className="icon-btn" onClick={() => setShowVoice(true)}>
            🎙️
          </button>
          <UserButton />
        </div>
      </div>

      {activeProfile && (
        <div style={{
          padding: "0 20px 12px",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--muted)",
        }}>
          Reading as <span style={{ color: "var(--accent)" }}>{activeProfile.name}</span>
          {activeProfile.age && ` · Age ${activeProfile.age}`}
        </div>
      )}

      <div className="genre-tabs">
        {GENRES.map((g) => (
          <button
            key={g.id}
            className={`genre-tab ${gf === g.id ? "active" : ""}`}
            style={
              gf === g.id
                ? { background: g.color, borderColor: g.color, color: "#fff" }
                : {}
            }
            onClick={() => setGf(g.id)}
          >
            {g.emoji} {g.label}
          </button>
        ))}
      </div>
      <div className="age-filter">
        {AGE_GROUPS.map((a) => (
          <button
            key={a.id}
            className={`age-btn ${af === a.id ? "active" : ""}`}
            onClick={() => setAf(af === a.id ? null : a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="story-grid">
        {isPremium && (
          <div className="story-card create-card" onClick={onCreateNew}>
            <div className="emoji">✨</div>
            <div className="title">Create a New Story</div>
          </div>
        )}
        {visibleStories.map((s) => (
          <div key={s.id} className="story-card" onClick={() => onSelect(s)}>
            {s.generated && <div className="my-badge">MY STORY</div>}
            <div className="emoji">{s.emoji}</div>
            <div className="title">{s.title}</div>
            <div className="badges">
              <span className="badge" style={{ background: s.color }}>
                {GENRES.find((g) => g.id === s.genre)?.label}
              </span>
              <span className="badge" style={{ background: "#6c5ce7" }}>
                {AGE_GROUPS.find((a) => a.id === s.age)?.label}
              </span>
            </div>
          </div>
        ))}
        {!isPremium && lockedCount > 0 && (
          <PaywallCard storiesRemaining={freeStoryLimit} />
        )}
      </div>
    </>
  );
}
