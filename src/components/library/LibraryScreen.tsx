"use client";

import { useState, useEffect } from "react";
import { UserButton } from "@/components/shared/ClerkSafe";
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
  setShowSettings?: (show: boolean) => void;
  isPremium?: boolean;
  freeStoryLimit?: number;
  activeProfile?: ChildProfile | null;
  /** All child profiles on this account. Used by the header avatar
   *  dropdown so switching kids doesn't require a full-page picker
   *  context-switch. */
  profiles?: ChildProfile[];
  /** Legacy: opens the dedicated profile-picker screen (still used
   *  as the "Manage kids" menu item in the dropdown). */
  onSwitchProfile?: () => void;
  /** New: switch directly to a given profile without leaving the
   *  library. Called from the header avatar dropdown. */
  onSwitchProfileDirect?: (profile: ChildProfile) => void;
  /** Titles of stories that arrived via background save during this
   *  session. Cards matching these titles render a small blue dot
   *  until the user opens the story. Keyed by title (not id) because
   *  the optimistic → DB UUID swap inside handleSaveStory makes id
   *  matching unreliable across the save lifecycle. */
  newStoryTitles?: Set<string>;
}

export function LibraryScreen({
  stories,
  readingHistory = [],
  onSelect,
  onCreateNew,
  onDeleteStory,
  setShowVoice,
  setShowSettings,
  isPremium = false,
  freeStoryLimit = 5,
  activeProfile,
  profiles = [],
  onSwitchProfile,
  onSwitchProfileDirect,
  newStoryTitles,
}: LibraryScreenProps) {
  const [gf, setGf] = useState("all");
  const [af, setAf] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showStorybook, setShowStorybook] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAllStories, setShowAllStories] = useState(false);
  const [kidMenuOpen, setKidMenuOpen] = useState(false);

  // Time-aware greeting for the hero section. Shifts copy based on local
  // hour so morning reads feel distinct from bedtime reads — same data,
  // different frame. Small touch; reads as a premium app that knows what
  // time of day it is.
  const getHeroLabel = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return "This Morning's Story";
    if (hour >= 11 && hour < 17) return "Today's Story";
    return "Tonight's Story";
  };

  // Close the kid-picker dropdown when the user clicks outside it.
  useEffect(() => {
    if (!kidMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".kid-picker")) return;
      setKidMenuOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [kidMenuOpen]);

  // Built-in story cover images — lazy-loaded from storyImages.json, which
  // holds pre-generated fal.media URLs for every page of every built-in
  // story. We only need page 0 for the library "book cover". Loaded once
  // on mount as a dynamic import so it's not bundled into the initial
  // library chunk. Until this resolves, cards fall back to the emoji
  // variant — the book shape still renders, just without cover art.
  const [coverImages, setCoverImages] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    import("@/data/storyImages.json")
      .then((mod) => {
        if (cancelled) return;
        const data = mod.default as Record<string, (string | null)[]>;
        // Extract just page 0 as the cover; null entries are skipped so the
        // fallback kicks in for stories whose page 1 failed to generate.
        const covers: Record<string, string> = {};
        for (const [id, pages] of Object.entries(data)) {
          if (Array.isArray(pages) && pages[0]) covers[id] = pages[0];
        }
        setCoverImages(covers);
      })
      .catch(() => { /* leave covers empty → every card falls back to emoji */ });
    return () => { cancelled = true; };
  }, []);

  // Resolve a story's cover image. Built-in stories come from the
  // storyImages map; AI stories use their own preloadedImages[0]. Either
  // one can be missing (slow fal.media page, unsaved generation, etc.) —
  // callers should pass the result straight to `<img src>` and render the
  // emoji fallback when it's null.
  const getCoverUrl = (s: Story): string | null => {
    if (s.generated) {
      return s.preloadedImages?.[0] ?? null;
    }
    return coverImages[s.id] ?? null;
  };

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

  // ── Home-page rail data ────────────────────────────────────────────
  // "Read Again" — deduped list of stories the active kid has read, most
  // recent first. We resolve each history entry back to its full Story
  // object so the existing renderBookCard can reuse cover art + metadata.
  //
  // EXCLUDES user-generated custom stories: those already have their own
  // "My Stories" rail, and showing a freshly-read custom story in both
  // places (right after the kid reads it) produced duplicate cards right
  // next to each other. Classics + built-in library stories still belong
  // here — Read Again is intentionally about re-visiting the catalog.
  const readAgainStories: Story[] = (() => {
    const seen = new Set<string>();
    const out: Story[] = [];
    for (const h of scopedReadingHistory) {
      if (seen.has(h.story_id)) continue;
      seen.add(h.story_id);
      const full = stories.find((s) => s.id === h.story_id);
      if (!full) continue;
      if (full.generated) continue; // custom story → lives in My Stories
      out.push(full);
    }
    return out;
  })();

  // Hero recommendation — pick a story the active kid hasn't read yet,
  // preferring content in their age band so the Tonight's Story slot
  // feels targeted. Fall through to broader pools if the ideal pool is
  // empty. Stable within a day (seeded by kid id + date) so the
  // recommendation doesn't flicker on every re-render.
  const heroStory: Story | null = (() => {
    const readIds = new Set(scopedReadingHistory.map((h) => h.story_id));
    // Map the kid's numeric age to the closest story age band. Simple
    // banding now — can swap in a smarter recommendation engine later
    // (reading history, preferred genres, favorite characters, etc.).
    const ageToBand = (n: number | null | undefined): string | null => {
      if (n == null) return null;
      if (n <= 4) return "2-4";
      if (n <= 7) return "4-7";
      return "7-10";
    };
    const kidBand = ageToBand(activeProfile?.age ?? null);
    const notRead = (s: Story) => !readIds.has(s.id);
    const inBand = (s: Story) => !kidBand || s.age === kidBand;

    // Preference order: (1) unread + in-band → (2) any in-band →
    // (3) unread overall → (4) anything.
    const tiers: Story[][] = [
      builtInStories.filter((s) => notRead(s) && inBand(s)),
      builtInStories.filter(inBand),
      builtInStories.filter(notRead),
      builtInStories,
    ];
    const pool = tiers.find((t) => t.length > 0) || [];
    if (pool.length === 0) return null;
    // Daily-stable pick: same kid + same day → same recommendation.
    const dateKey = new Date().toISOString().slice(0, 10);
    const seed = Array.from(`${activeProfile?.id || ""}:${dateKey}`).reduce(
      (a, c) => (a * 31 + c.charCodeAt(0)) | 0,
      0,
    );
    const idx = Math.abs(seed) % pool.length;
    return pool[idx];
  })();

  // Age-relevance sort. Puts stories in the active kid's band FIRST,
  // then adjacent bands (a 5yo who's ready for 7-10 sees 4-7 before
  // 2-4, and vice versa), then whatever's left. Stable within each
  // tier so we don't shuffle on every render. If there's no active
  // profile (e.g. guest mode), leaves the input order untouched so
  // parents browsing without a picked kid see everything balanced.
  //
  // Uses the same ageToBand() mapping as the hero picker: 2-4 for
  // ages ≤4, 4-7 for 5-7, 7-10 for 8+. Simple buckets — we can swap
  // in a smarter engine later (reading history, preferred genres)
  // without changing the call sites.
  const ageToBand = (n: number | null | undefined): string | null => {
    if (n == null) return null;
    if (n <= 4) return "2-4";
    if (n <= 7) return "4-7";
    return "7-10";
  };
  const kidBand = ageToBand(activeProfile?.age ?? null);
  const BAND_ORDER: Record<string, number> = { "2-4": 0, "4-7": 1, "7-10": 2 };
  const bandDistance = (band: string): number => {
    if (!kidBand) return 0;
    if (band === kidBand) return 0;
    const a = BAND_ORDER[band] ?? 9;
    const b = BAND_ORDER[kidBand] ?? 9;
    return Math.abs(a - b);
  };
  const sortByAgeRelevance = <T extends Story>(list: T[]): T[] => {
    // Tag each with its original index to make the sort stable without
    // relying on the engine being stable (Array.sort is stable in
    // modern engines, but belt-and-suspenders).
    return list
      .map((s, i) => ({ s, i, d: bandDistance(s.age) }))
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .map((x) => x.s);
  };

  // Classics rail — only the built-in classic retellings. Sorted so
  // the active kid's age-band books lead, then adjacent, then rest.
  // Within a band, alphabetized so ordering is stable across sessions.
  const classicsRail: Story[] = sortByAgeRelevance(
    builtInStories
      .filter((s) => s.isClassic)
      .sort((a, b) => a.title.localeCompare(b.title)),
  );

  // Per-genre rails — maps each real genre to its built-in stories.
  // Excludes "all", "random", and "classics" (classics get their own
  // featured rail above). Each rail is age-relevance sorted so a 5yo
  // sees the 4-7 Adventure stories before the 7-10 ones, etc. Empty
  // genres are dropped so we don't render an empty rail.
  const genreRails: Array<{ id: string; label: string; emoji: string; stories: Story[] }> =
    GENRES
      .filter((g) => g.id !== "all" && g.id !== "random" && g.id !== "classics")
      .map((g) => ({
        id: g.id,
        label: g.label,
        emoji: g.emoji,
        stories: sortByAgeRelevance(
          builtInStories.filter((s) => s.genre === g.id && !s.isClassic),
        ),
      }))
      .filter((g) => g.stories.length > 0);

  // ── Rail card — proper book-cover look ───────────────────────────
  // The whole card is ONE book object: illustration on the top 60%,
  // title (and classic author) printed on the "book face" (cream
  // paper) below. Spine gradient on the left edge. Sized so exactly
  // four cards fit across the home-inset-bound rail at any viewport.
  const renderRailCard = (s: Story) => {
    const coverUrl = getCoverUrl(s);
    const isClassic = !!s.isClassic;
    const isNew = !!newStoryTitles && newStoryTitles.has(s.title);
    return (
      <button
        key={s.id}
        className={`rail-card${isClassic ? " rail-card-classic" : ""}`}
        onClick={() => onSelect(s)}
        aria-label={`${s.title}${s.originalAuthor ? ` by ${s.originalAuthor}` : ""}`}
      >
        {isNew && <span className="new-story-dot" aria-label="New" />}
        <div className="rail-card-book">
          <div className="rail-card-img-wrap">
            {coverUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={coverUrl} alt="" className="rail-card-img" loading="lazy" />
            ) : (
              <div
                className="rail-card-fallback"
                style={{ background: s.color }}
                aria-hidden="true"
              >
                <span className="rail-card-fallback-emoji">{s.emoji}</span>
              </div>
            )}
          </div>
          <div className="rail-card-face">
            <div className="rail-card-title">{s.title}</div>
            {isClassic && s.originalAuthor && (
              <div className="rail-card-author">{s.originalAuthor}</div>
            )}
          </div>
        </div>
      </button>
    );
  };

  // Book-style story card. Shared by the main library grid and the
  // "My Stories" subview so both places read as a shelf of books instead
  // of a wall of flat tiles. If a cover URL is available, the full painted
  // illustration fills the card; otherwise the card falls back to a
  // centered emoji on the story's brand color (the `no-cover` variant
  // handled in globals.css).
  const renderBookCard = (s: Story, options?: { deletable?: boolean }) => {
    const coverUrl = getCoverUrl(s);
    const genreLabel = GENRES.find((g) => g.id === s.genre)?.label;
    const ageLabel = AGE_GROUPS.find((a) => a.id === s.age)?.label;
    const isNew = !!newStoryTitles && newStoryTitles.has(s.title);
    const isClassic = !!s.isClassic;
    return (
      <div
        key={s.id}
        className={`story-card${coverUrl ? "" : " no-cover"}${isClassic ? " classic-card" : ""}`}
        onClick={() => onSelect(s)}
        // CSS custom property read by `.story-card.no-cover` to tint the
        // fallback cover in the story's brand color. Ignored when an
        // actual cover image is present.
        style={{ ["--fallback-color" as string]: s.color }}
      >
        {isNew && (
          <span className="new-story-dot" aria-label="New story" title="New story" />
        )}
        {options?.deletable && onDeleteStory && (
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
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="book-cover-image"
            loading="lazy"
          />
        ) : (
          <div className="book-fallback-emoji" aria-hidden="true">
            {s.emoji}
          </div>
        )}
        {isClassic && (
          <div className="classic-collection-label">Classics Collection</div>
        )}
        <div className="book-title-block">
          <div className="title">{s.title}</div>
          {isClassic && s.originalAuthor && (
            <div className="classic-author">{s.originalAuthor}</div>
          )}
          <div className="badges">
            {!isClassic && genreLabel && <span className="badge">{genreLabel}</span>}
            {ageLabel && <span className="badge">{ageLabel}</span>}
          </div>
        </div>
      </div>
    );
  };

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
            {myStories.map((s) => renderBookCard(s, { deletable: true }))}
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

  // ── "All Stories" subview — full filterable grid (the old main view) ──
  if (showAllStories) {
    return (
      <>
        <div className="header">
          <button className="icon-btn" onClick={() => setShowAllStories(false)}>
            ←
          </button>
          <h1 className="subview-title">All Stories</h1>
          <div className="header-btns">
            <UserButton />
          </div>
        </div>

        <div className="library-search-wrap">
          <input
            type="search"
            className="library-search"
            placeholder="🔎  Search stories…"
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

        {visibleBuiltIn.length === 0 && search ? (
          <div className="storybook-empty" style={{ padding: "24px 20px" }}>
            <div style={{ fontSize: 40 }}>🔎</div>
            <h2 style={{ fontSize: 18 }}>No stories match &ldquo;{search}&rdquo;</h2>
            <p style={{ fontSize: 14 }}>Try a different search, or clear filters.</p>
          </div>
        ) : (
          <div className="story-grid">
            {visibleBuiltIn.map((s) => renderBookCard(s))}
            {!isPremium && lockedCount > 0 && (
              <PaywallCard storiesRemaining={freeStoryLimit} />
            )}
          </div>
        )}
      </>
    );
  }

  // ── Main library view — home feed (editorial rails) ──
  const heroCoverUrl = heroStory ? getCoverUrl(heroStory) : null;
  // Hero shows just the age band label ("Ages 4–7") without the leading
  // emoji icon — the icon is redundant on top of an illustration.
  const heroAgeLabel = heroStory
    ? AGE_GROUPS.find((a) => a.id === heroStory.age)?.label?.replace(/^\S+\s+/, "")
    : null;

  return (
    <>
      <div className="header home-header">
        <img
          src="/brand/logo-wordmark.png"
          alt="StoryTime"
          className="brand-wordmark"
        />
        <div className="header-btns">
          <button
            className="icon-btn"
            onClick={() => setShowAllStories(true)}
            title="Browse all stories"
            aria-label="Browse all stories"
          >
            🔎
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowVoice(true)}
            title="Voice settings"
          >
            🎙️
          </button>
          {setShowSettings && (
            <button
              className="icon-btn"
              onClick={() => setShowSettings(true)}
              title="Parent settings"
            >
              ⚙️
            </button>
          )}
          {/* Kid picker — compact avatar-over-name. With >1 profile,
              tapping opens a dropdown showing other kids as avatar-only
              circles with tiny names underneath. Dropdown is
              position:absolute so it doesn't push the header around. */}
          {activeProfile && profiles.length > 1 && onSwitchProfileDirect ? (
            <div className="kid-picker">
              <button
                className="kid-picker-trigger"
                onClick={(e) => { e.stopPropagation(); setKidMenuOpen(!kidMenuOpen); }}
                title={`Viewing ${activeProfile.name}'s library — tap to switch kid`}
                aria-label={`Viewing ${activeProfile.name}'s library`}
                aria-expanded={kidMenuOpen}
              >
                <span className="kid-picker-avatar">{activeProfile.avatar_emoji}</span>
                <span className="kid-picker-name">{activeProfile.name}</span>
              </button>
              {kidMenuOpen && (
                <div className="kid-picker-menu" role="menu">
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      role="menuitem"
                      className={`kid-picker-option${p.id === activeProfile.id ? " active" : ""}`}
                      onClick={() => {
                        if (p.id !== activeProfile.id) onSwitchProfileDirect(p);
                        setKidMenuOpen(false);
                      }}
                      title={`${p.name}${p.age != null ? ` · Age ${p.age}` : ""}`}
                    >
                      <span className="kid-picker-option-avatar">{p.avatar_emoji}</span>
                      <span className="kid-picker-option-name">{p.name}</span>
                    </button>
                  ))}
                  {onSwitchProfile && (
                    <button
                      role="menuitem"
                      className="kid-picker-option kid-picker-manage"
                      onClick={() => { setKidMenuOpen(false); onSwitchProfile(); }}
                      title="Manage kids"
                    >
                      <span className="kid-picker-option-avatar" aria-hidden="true">⚙️</span>
                      <span className="kid-picker-option-name">Manage</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : activeProfile && onSwitchProfile ? (
            <button
              className="kid-picker-trigger"
              onClick={onSwitchProfile}
              title={`Viewing ${activeProfile.name}'s library`}
            >
              <span className="kid-picker-avatar">{activeProfile.avatar_emoji}</span>
              <span className="kid-picker-name">{activeProfile.name}</span>
            </button>
          ) : null}
          <UserButton />
        </div>
      </div>

      {/* Featured hero — time-aware recommendation for the active kid.
          One big card with the illustration and title overlay; tap to
          open. This replaces the old illustration-only banner with
          something actionable. */}
      {heroStory && (
        <button
          className="home-hero"
          onClick={() => onSelect(heroStory)}
          aria-label={`${getHeroLabel()}: ${heroStory.title}`}
        >
          {heroCoverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={heroCoverUrl} alt="" className="home-hero-img" />
          ) : (
            <div
              className="home-hero-fallback"
              style={{ background: heroStory.color }}
              aria-hidden="true"
            >
              <span className="home-hero-fallback-emoji">{heroStory.emoji}</span>
            </div>
          )}
          <div className="home-hero-overlay" aria-hidden="true" />
          <div className="home-hero-text">
            <div className="home-hero-eyebrow">{getHeroLabel()}</div>
            <div className="home-hero-title">{heroStory.title}</div>
            <span className="home-hero-cta">Start Reading</span>
          </div>
          {heroAgeLabel && (
            <div className="home-hero-age" aria-hidden="true">{heroAgeLabel}</div>
          )}
        </button>
      )}

      {/* Read Again + My Stories folder — combined rail under the hero.
          First card is the "My Stories" folder, shown only after the
          kid has saved their first custom story. The rest are stories
          they've previously read. Section hides entirely if both would
          be empty. */}
      {(readAgainStories.length > 0 || (isPremium && myStories.length > 0)) && (
        <section className="home-rail">
          <div className="home-rail-header">
            <h2 className="home-rail-title">Read Again</h2>
            {(readAgainStories.length > 6 || myStories.length > 3) && (
              <button
                className="home-rail-see-all"
                onClick={() => setShowHistory(true)}
              >
                See all
              </button>
            )}
          </div>
          <div className="home-rail-scroller">
            {isPremium && myStories.length > 0 && (() => {
              // Use the most-recently-saved custom story's cover as the
              // illustration on the My Stories folder book. Falls back to
              // a cream-gold solid if no cover is available yet.
              const latestCustomCover =
                myStories.map((s) => s.preloadedImages?.[0]).find((u) => !!u) ||
                null;
              return (
                <button
                  key="__my-stories-folder"
                  className="rail-card rail-card-folder"
                  onClick={() => setShowStorybook(true)}
                  aria-label={`My Stories — ${myStories.length} saved`}
                >
                  <div className="rail-card-book">
                    <span className="rail-card-folder-count">
                      {myStories.length}
                    </span>
                    <div className="rail-card-img-wrap">
                      {latestCustomCover ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={latestCustomCover}
                          alt=""
                          className="rail-card-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="rail-card-folder-blank" aria-hidden="true" />
                      )}
                    </div>
                    <div className="rail-card-face rail-card-folder-face">
                      <div className="rail-card-title">My Stories</div>
                    </div>
                  </div>
                </button>
              );
            })()}
            {readAgainStories.slice(0, 12).map((s) => renderRailCard(s))}
          </div>
        </section>
      )}

      {/* Create Your Own Story — banner with illustration filling the
          whole module, text overlaid in the empty (top-right) area of
          the image. Premium-gated (free users hit the paywall). */}
      {isPremium && (
        <button
          className="home-create-cta"
          onClick={onCreateNew}
          aria-label="Create your own story"
        >
          <img
            src="/brand/hero-illustration.png"
            alt=""
            className="home-create-cta-bg"
          />
          <div className="home-create-cta-overlay" aria-hidden="true" />
          <div className="home-create-cta-text">
            <div className="home-create-cta-eyebrow">Make it personal</div>
            <div className="home-create-cta-title">Create Your Own Story</div>
            <span className="home-create-cta-btn">Build a Story</span>
          </div>
        </button>
      )}

      {/* Classics Collection rail — gold-foil cards. Featured above the
          genre rails because it's the premium curated content. */}
      {classicsRail.length > 0 && (
        <section className="home-rail">
          <div className="home-rail-header">
            <h2 className="home-rail-title">Classics Collection</h2>
            <button
              className="home-rail-see-all"
              onClick={() => {
                setGf("classics");
                setShowAllStories(true);
              }}
            >
              See all
            </button>
          </div>
          <div className="home-rail-scroller">
            {classicsRail.slice(0, 12).map((s) => renderRailCard(s))}
          </div>
        </section>
      )}

      {/* Per-genre rails — one for each genre that actually has stories. */}
      {genreRails.map((g) => (
        <section className="home-rail" key={g.id}>
          <div className="home-rail-header">
            <h2 className="home-rail-title">{g.label}</h2>
            {g.stories.length > 6 && (
              <button
                className="home-rail-see-all"
                onClick={() => {
                  setGf(g.id);
                  setShowAllStories(true);
                }}
              >
                See all
              </button>
            )}
          </div>
          <div className="home-rail-scroller">
            {g.stories.slice(0, 12).map((s) => renderRailCard(s))}
          </div>
        </section>
      ))}

      {/* Footer — quick links to the list views. */}
      <div className="home-footer">
        <button
          className="home-footer-link"
          onClick={() => setShowAllStories(true)}
        >
          Browse All Stories →
        </button>
        {myStories.length > 0 && (
          <button
            className="home-footer-link"
            onClick={() => setShowStorybook(true)}
          >
            My Stories ({myStories.length}) →
          </button>
        )}
        {scopedReadingHistory.length > 0 && (
          <button
            className="home-footer-link"
            onClick={() => setShowHistory(true)}
          >
            Recently Read →
          </button>
        )}
      </div>

      {/* Free-tier paywall nudge at the very bottom, only when relevant. */}
      {!isPremium && lockedCount > 0 && (
        <div className="home-paywall-wrap">
          <PaywallCard storiesRemaining={freeStoryLimit} />
        </div>
      )}
    </>
  );
}
