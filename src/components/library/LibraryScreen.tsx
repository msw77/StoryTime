"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Story } from "@/types/story";
import { GENRES, AGE_GROUPS } from "@/data/genres";
import { PaywallCard } from "@/components/shared/PaywallCard";

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ChildProfile {
  id: string;
  name: string;
  age: number | null;
  avatar_emoji: string;
}

interface ReadingHistoryEntry {
  id: string;
  story_id: string;
  story_title: string;
  story_emoji: string;
  story_genre: string;
  story_age: string;
  story_color: string;
  is_generated: boolean;
  started_at: string;
}

interface LibraryScreenProps {
  stories: Story[];
  readingHistory?: ReadingHistoryEntry[];
  onSelect: (story: Story) => void;
  onCreateNew: () => void;
  onDeleteStory?: (storyId: string) => void;
  setShowVoice: (show: boolean) => void;
  isPremium?: boolean;
  freeStoryLimit?: number;
  activeProfile?: ChildProfile | null;
  onSwitchProfile?: () => void;
}

export function LibraryScreen({
  stories,
  readingHistory = [],
  onSelect,
  onCreateNew,
  onDeleteStory,
  setShowVoice,
  isPremium = false,
  freeStoryLimit = 5,
  activeProfile,
  onSwitchProfile,
}: LibraryScreenProps) {
  const [gf, setGf] = useState("all");
  const [af, setAf] = useState<string | null>(null);
  const [showStorybook, setShowStorybook] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Separate custom stories from built-in stories
  const myStories = stories.filter((s) => s.generated);
  const builtInStories = stories.filter((s) => !s.generated);

  // Apply genre & age filters to built-in stories
  const filteredBuiltIn = builtInStories.filter((s) => {
    if (gf !== "all" && s.genre !== gf) return false;
    if (af && s.age !== af) return false;
    return true;
  });

  // For free users, only show the first N built-in stories
  const visibleBuiltIn = isPremium ? filteredBuiltIn : filteredBuiltIn.slice(0, freeStoryLimit);
  const lockedCount = isPremium ? 0 : Math.max(0, filteredBuiltIn.length - freeStoryLimit);

  // ── "My Storybook" folder view ──
  if (showStorybook) {
    return (
      <>
        <div className="header">
          <button className="icon-btn" onClick={() => setShowStorybook(false)}>
            ←
          </button>
          <h1>📖 My Stories</h1>
          <div className="header-btns">
            <UserButton />
          </div>
        </div>

        {myStories.length === 0 ? (
          <div className="storybook-empty">
            <div style={{ fontSize: 56 }}>📖</div>
            <h2>No stories yet!</h2>
            <p>Stories you create will appear here.</p>
            <button className="pill-btn primary" onClick={() => { setShowStorybook(false); onCreateNew(); }}>
              Create Your First Story
            </button>
          </div>
        ) : (
          <div className="story-grid" style={{ paddingTop: 8 }}>
            {myStories.map((s) => (
              <div key={s.id} className="story-card" onClick={() => onSelect(s)}>
                {onDeleteStory && (
                  <button
                    className="delete-story-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this story? This can't be undone.")) {
                        onDeleteStory(s.id);
                      }
                    }}
                    title="Delete story"
                  >
                    ✕
                  </button>
                )}
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
          </div>
        )}
      </>
    );
  }

  // ── "Recently Read" folder view ──
  if (showHistory) {
    // Deduplicate: show each story only once (most recent read)
    const seen = new Set<string>();
    const uniqueHistory = readingHistory.filter((h) => {
      if (seen.has(h.story_id)) return false;
      seen.add(h.story_id);
      return true;
    });

    return (
      <>
        <div className="header">
          <button className="icon-btn" onClick={() => setShowHistory(false)}>
            ←
          </button>
          <h1>🕐 Recently Read</h1>
          <div className="header-btns">
            <UserButton />
          </div>
        </div>

        {uniqueHistory.length === 0 ? (
          <div className="storybook-empty">
            <div style={{ fontSize: 56 }}>🕐</div>
            <h2>No reading history yet!</h2>
            <p>Stories you read will appear here.</p>
          </div>
        ) : (
          <div className="history-list">
            {uniqueHistory.map((h) => {
              const fullStory = stories.find((s) => s.id === h.story_id);
              return (
                <div
                  key={h.id}
                  className="history-item"
                  onClick={() => fullStory && onSelect(fullStory)}
                  style={{ opacity: fullStory ? 1 : 0.5 }}
                >
                  <div className="history-emoji">{h.story_emoji}</div>
                  <div className="history-info">
                    <div className="history-title">{h.story_title}</div>
                    <div className="history-meta">
                      {GENRES.find((g) => g.id === h.story_genre)?.label || h.story_genre}
                      {" · "}
                      {formatTimeAgo(h.started_at)}
                    </div>
                  </div>
                  <div className="history-arrow">›</div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  // ── Main library view ──
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

      <div className="filter-row">
        <div className="filter-select-wrap">
          <select
            className="filter-select"
            value={gf}
            onChange={(e) => setGf(e.target.value)}
          >
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji} {g.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-select-wrap">
          <select
            className="filter-select"
            value={af || ""}
            onChange={(e) => setAf(e.target.value || null)}
          >
            <option value="">All Ages</option>
            {AGE_GROUPS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Top action cards — Create + My Stories + Recently Read */}
      {isPremium && (
        <div className="action-cards three-col">
          <div className="story-card create-card" onClick={onCreateNew}>
            <div className="emoji">✨</div>
            <div className="title">Create Story</div>
          </div>
          <div className="story-card storybook-card" onClick={() => setShowStorybook(true)}>
            <div className="emoji">📖</div>
            <div className="title">My Stories</div>
            {myStories.length > 0 && (
              <div className="storybook-count">{myStories.length}</div>
            )}
          </div>
          <div className="story-card history-card" onClick={() => setShowHistory(true)}>
            <div className="emoji">🕐</div>
            <div className="title">Recently Read</div>
            {readingHistory.length > 0 && (
              <div className="storybook-count">{new Set(readingHistory.map((h) => h.story_id)).size}</div>
            )}
          </div>
        </div>
      )}

      {/* Built-in Story Library */}
      <div className="library-section">
        <div className="section-header">
          <h2 className="section-title">Story Library</h2>
        </div>
        <div className="story-grid">
          {visibleBuiltIn.map((s) => (
            <div key={s.id} className="story-card" onClick={() => onSelect(s)}>
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
      </div>
    </>
  );
}
