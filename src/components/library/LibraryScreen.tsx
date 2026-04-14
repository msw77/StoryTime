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
  child_profile_id?: string | null;
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
  const [search, setSearch] = useState("");
  const [showStorybook, setShowStorybook] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Case-insensitive search across title, genre label, AND story page text.
  // Every story's pages are already in memory (as [pageTitle, bodyText] tuples),
  // so scanning body text is just a string .includes call — no DB round-trip.
  // Fast enough even with hundreds of stories; runs per-keystroke.
  const searchMatches = (s: Story): boolean => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if (s.title.toLowerCase().includes(q)) return true;
    const genreLabel = GENRES.find((g) => g.id === s.genre)?.label.toLowerCase() || "";
    if (genreLabel.includes(q)) return true;
    // Scan body text of every page. pages is [pageTitle, bodyText][].
    for (const page of s.pages) {
      // page[0] is the page header/title, page[1] is the body text
      if (page[0] && page[0].toLowerCase().includes(q)) return true;
      if (page[1] && page[1].toLowerCase().includes(q)) return true;
    }
    return false;
  };

  // Scope "My Stories" and "Recently Read" to the active child profile so
  // each kid has their own library. Legacy rows with a null child_profile_id
  // (saved before profiles existed) are shown to every profile as "shared"
  // so they don't silently disappear from existing accounts.
  const matchesActiveProfile = (childProfileId: string | null | undefined) => {
    if (!activeProfile) return true;
    if (childProfileId == null) return true;
    return childProfileId === activeProfile.id;
  };

  // Separate custom stories from built-in stories
  const myStories = stories
    .filter((s) => s.generated)
    .filter((s) => matchesActiveProfile(s.childProfileId))
    .filter(searchMatches);
  const builtInStories = stories.filter((s) => !s.generated);
  const scopedReadingHistory = readingHistory.filter((h) =>
    matchesActiveProfile(h.child_profile_id),
  );

  // Apply genre & age filters, then search, to built-in stories
  const filteredBuiltIn = builtInStories.filter((s) => {
    if (gf !== "all" && s.genre !== gf) return false;
    if (af && s.age !== af) return false;
    if (!searchMatches(s)) return false;
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
          <h1 className="subview-title">My Stories</h1>
          <div className="header-btns">
            <UserButton />
          </div>
        </div>

        <div className="library-search-wrap">
          <input
            type="search"
            className="library-search"
            placeholder="🔎  Search your stories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="library-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {myStories.length === 0 ? (
          <div className="storybook-empty">
            <img
              src="/brand/empty-library.png"
              alt=""
              className="empty-illustration"
            />
            <h2>{search ? "No matches" : "No stories yet!"}</h2>
            <p>{search ? `Nothing matched "${search}". Try a different search.` : "Stories you create will appear here."}</p>
            {!search && (
              <button className="pill-btn primary" onClick={() => { setShowStorybook(false); onCreateNew(); }}>
                Create Your First Story
              </button>
            )}
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
                  <span className="badge" style={{ background: "var(--accent2)" }}>
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
    const uniqueHistory = scopedReadingHistory.filter((h) => {
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
          <h1 className="subview-title">Recently Read</h1>
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
        {/* Hand-lettered Fraunces wordmark placeholder generated via fal.ai
            (nano-banana-2). Drop-in replacement for the old emoji+text h1.
            Height-constrained; width flows from the natural aspect. */}
        <img
          src="/brand/logo-wordmark.png"
          alt="StoryTime"
          className="brand-wordmark"
        />
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
          padding: "0 20px 4px",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--muted)",
        }}>
          Reading as <span style={{ color: "var(--accent)" }}>{activeProfile.name}</span>
          {activeProfile.age && ` · Age ${activeProfile.age}`}
        </div>
      )}

      {/* Hero illustration banner — parent+child reading in a window nook.
          Editorial anchor above the filter row on the main library view.
          Placeholder (fal.ai nano-banana-2). Height-capped so it doesn't
          push the story grid too far down the page. */}
      <div className="library-hero">
        <img
          src="/brand/hero-illustration.png"
          alt="A parent and child reading together in a cozy window nook"
          className="library-hero-img"
        />
      </div>

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

      {/* Top action cards — Create + My Stories + Recently Read.
          Emojis replaced with custom brand icons (fal.ai placeholders,
          see public/brand/). If any image 404s, the card still renders
          without crashing; alt text is the same as the title below. */}
      {isPremium && (
        <div className="action-cards three-col">
          <div className="story-card create-card" onClick={onCreateNew}>
            <img src="/brand/icon-create.png" alt="" className="action-icon" />
            <div className="title">Create Story</div>
          </div>
          <div className="story-card storybook-card" onClick={() => setShowStorybook(true)}>
            <img src="/brand/icon-library.png" alt="" className="action-icon" />
            <div className="title">My Stories</div>
            {myStories.length > 0 && (
              <div className="storybook-count">{myStories.length}</div>
            )}
          </div>
          <div className="story-card history-card" onClick={() => setShowHistory(true)}>
            <img src="/brand/icon-history.png" alt="" className="action-icon" />
            <div className="title">Recently Read</div>
            {scopedReadingHistory.length > 0 && (
              <div className="storybook-count">{new Set(scopedReadingHistory.map((h) => h.story_id)).size}</div>
            )}
          </div>
        </div>
      )}

      {/* Built-in Story Library */}
      <div className="library-section">
        <div className="section-header">
          <h2 className="section-title">Story Library</h2>
          <div className="section-search-wrap">
            <input
              type="search"
              className="section-search"
              placeholder="🔎  Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="section-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {visibleBuiltIn.length === 0 && search ? (
          <div className="storybook-empty" style={{ padding: "24px 20px" }}>
            <div style={{ fontSize: 40 }}>🔎</div>
            <h2 style={{ fontSize: 18 }}>No stories match &ldquo;{search}&rdquo;</h2>
            <p style={{ fontSize: 14 }}>Try a different search, or clear filters.</p>
          </div>
        ) : (
          <div className="story-grid">
            {visibleBuiltIn.map((s) => (
              <div key={s.id} className="story-card" onClick={() => onSelect(s)}>
                <div className="emoji">{s.emoji}</div>
                <div className="title">{s.title}</div>
                <div className="badges">
                  <span className="badge" style={{ background: s.color }}>
                    {GENRES.find((g) => g.id === s.genre)?.label}
                  </span>
                  <span className="badge" style={{ background: "var(--accent2)" }}>
                    {AGE_GROUPS.find((a) => a.id === s.age)?.label}
                  </span>
                </div>
              </div>
            ))}
            {!isPremium && lockedCount > 0 && (
              <PaywallCard storiesRemaining={freeStoryLimit} />
            )}
          </div>
        )}
      </div>
    </>
  );
}
