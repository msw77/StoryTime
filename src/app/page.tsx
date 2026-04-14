"use client";

import { useState, useEffect } from "react";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import { Story } from "@/types/story";
import { ALL_STORIES } from "@/data/stories";
import { GENRES } from "@/data/genres";
import { useSpeech } from "@/hooks/useSpeech";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { LibraryScreen } from "@/components/library/LibraryScreen";
import { ReaderScreen } from "@/components/reader/ReaderScreen";
import { BuilderScreen } from "@/components/builder/BuilderScreen";
import { VoiceModal } from "@/components/shared/VoiceModal";
import { ProfileSelector } from "@/components/shared/ProfileSelector";

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

const FREE_STORY_LIMIT = 5;

export default function Home() {
  const { isLoaded: clerkLoaded, isSignedIn } = useUser();
  const [screen, setScreen] = useState<"profiles" | "library" | "reader" | "builder">("profiles");
  const [cur, setCur] = useState<Story | null>(null);
  const [stories, setStories] = useState<Story[]>(ALL_STORIES);
  const [showVoice, setShowVoice] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ChildProfile | null>(null);
  const [isPremium, setIsPremium] = useState(true); // TODO: remove dev override — temporarily true to test builder
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry[]>([]);
  const speech = useSpeech();
  const sfx = useSoundEffects();

  // Mark as loaded (saved stories now come from database, loaded after sign-in)
  useEffect(() => {
    setLoaded(true);
  }, []);

  // When signed in, fetch user + profiles from our API routes
  useEffect(() => {
    if (!isSignedIn) return;

    async function loadUserAndProfiles() {
      try {
        // Get or create user in Supabase via our API
        const userRes = await fetch("/api/user");
        if (userRes.ok) {
          const userData = await userRes.json();
          // TODO: remove dev override — temporarily always premium to test builder
          setIsPremium(true || userData.subscription_status === "premium" || userData.subscription_status === "family");
        }

        // Load child profiles via our API
        const profilesRes = await fetch("/api/profiles");
        if (profilesRes.ok) {
          const profilesData = await profilesRes.json();
          setProfiles(profilesData);

          // If only one profile, auto-select it
          if (profilesData.length === 1) {
            setActiveProfile(profilesData[0]);
            setScreen("library");
          }
        }

        // Load reading history
        const historyRes = await fetch("/api/reading-history");
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (Array.isArray(historyData)) {
            setReadingHistory(historyData);
          }
        }

        // Load saved AI stories from database
        const storiesRes = await fetch("/api/stories");
        if (storiesRes.ok) {
          const savedStories = await storiesRes.json();
          if (Array.isArray(savedStories) && savedStories.length > 0) {
            interface DbStory {
              id: string;
              title: string;
              emoji: string;
              genre: string;
              age_group: string;
              pages: string | [string, string][];
              page_count: number;
              full_pages?: { scene: string; mood: string }[];
              character_description?: string;
              illustration_urls?: (string | null)[];
              audio_urls?: (string | null)[];
              word_timings?: (import("@/types/story").WordTiming[] | null)[];
              child_profile_id?: string | null;
            }
            const mapped: Story[] = (savedStories as DbStory[]).map((s) => {
              const gc = GENRES.find((g) => g.id === s.genre);
              return {
                id: s.id,
                title: s.title,
                emoji: s.emoji || "✨",
                color: gc?.color || "#6366f1",
                genre: s.genre,
                age: s.age_group,
                pages: typeof s.pages === "string" ? JSON.parse(s.pages) : s.pages,
                generated: true,
                childProfileId: s.child_profile_id ?? null,
                fullPages: s.full_pages || undefined,
                characterDescription: s.character_description || undefined,
                // Hydrate saved image URLs so the reader skips regeneration.
                // Missing/null entries will still lazy-generate on open.
                preloadedImages: Array.isArray(s.illustration_urls) ? s.illustration_urls : undefined,
                // Hydrate persisted audio URLs + word timings so the reader
                // plays from Supabase Storage instead of re-calling /api/tts.
                audioUrls: Array.isArray(s.audio_urls) ? s.audio_urls : undefined,
                wordTimings: Array.isArray(s.word_timings) ? s.word_timings : undefined,
              };
            });
            setStories((prev) => [...mapped, ...prev]);
          }
        }
      } catch (err) {
        console.error("Failed to load user data:", err);
      }
    }

    loadUserAndProfiles();
  }, [isSignedIn]);

  const handleSelectProfile = (profile: ChildProfile) => {
    setActiveProfile(profile);
    setScreen("library");
  };

  const handleCreateProfile = async (name: string, age: number, emoji: string) => {
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, age, avatar_emoji: emoji }),
      });

      if (res.ok) {
        const profile = await res.json();
        setProfiles((prev) => [...prev, profile]);
        setActiveProfile(profile);
        setScreen("library");
      }
    } catch (err) {
      console.error("Failed to create profile:", err);
    }
  };

  const handleSelect = (s: Story) => {
    setCur(s);
    setScreen("reader");

    // Log to reading history (fire and forget — don't block the reader)
    fetch("/api/reading-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storyId: s.id,
        storyTitle: s.title,
        storyEmoji: s.emoji,
        storyGenre: s.genre,
        storyAge: s.age,
        storyColor: s.color,
        isGenerated: s.generated || false,
        totalPages: s.pages.length,
        childProfileId: activeProfile?.id,
      }),
    })
      .then((res) => res.json())
      .then((entry) => {
        if (entry?.id) {
          setReadingHistory((prev) => [entry, ...prev].slice(0, 20));
        }
      })
      .catch(() => {}); // Don't block if logging fails
  };

  const handleBack = () => {
    setScreen("library");
    setCur(null);

    // Refresh reading history when returning to library
    fetch("/api/reading-history")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setReadingHistory(data);
      })
      .catch(() => {});
  };

  const handleBackToProfiles = () => {
    setActiveProfile(null);
    setScreen("profiles");
  };

  const handleCreated = async (s: Story) => {
    setCur(s);
    setScreen("reader");
  };

  const handleDeleteStory = async (storyId: string) => {
    try {
      const res = await fetch(`/api/stories?id=${storyId}`, { method: "DELETE" });
      if (res.ok) {
        setStories((prev) => prev.filter((s) => s.id !== storyId));
      }
    } catch (err) {
      console.error("Failed to delete story:", err);
    }
  };

  const handleSaveStory = async (imageUrls: (string | null)[]) => {
    if (!cur) return;

    // ── Optimistic save ──────────────────────────────────────────────────
    // The server takes 15-30s to generate + upload TTS audio for every page
    // before it returns. Waiting for that made the save feel broken — the
    // story wouldn't appear in "My Stories" until the upload finished.
    //
    // Instead, add the story to the local library right away using a fresh
    // UUID (so the reader no longer sees it as an unsaved "ai_*" story and
    // won't re-prompt), then replace it with the persisted DB row once the
    // fetch resolves. If the user reopens the story before audio finishes
    // uploading, the reader falls back to on-demand /api/tts — still works,
    // just a bit slower on that one session.
    const optimisticId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `opt_${Date.now()}`;
    const optimistic: Story = {
      ...cur,
      id: optimisticId,
      generated: true,
      childProfileId: activeProfile?.id ?? null,
      preloadedImages: imageUrls,
    };
    setStories((prev) => [optimistic, ...prev]);
    setCur(optimistic);

    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cur.title,
          emoji: cur.emoji,
          genre: cur.genre,
          age: cur.age,
          pages: cur.pages,
          duration: cur.duration,
          childProfileId: activeProfile?.id,
          fullPages: cur.fullPages,
          characterDescription: cur.characterDescription,
          // Persist the generated images so future opens don't regenerate them.
          // Null entries are pages whose images haven't loaded yet — they'll
          // regenerate on-demand next time (a partial save is better than none).
          illustrationUrls: imageUrls,
        }),
      });

      // If the server didn't accept the save, we must roll back the
      // optimistic insert — otherwise the user sees a "Saved ✓" state for
      // a story that doesn't exist on the server, and a refresh silently
      // deletes it. This was the original bug Codex flagged (#6).
      if (!res.ok) {
        let errMsg = `Save failed (${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody?.error) errMsg = String(errBody.error);
        } catch { /* ignore parse errors — use status-only message */ }
        throw new Error(errMsg);
      }

      // Use the real DB UUID returned by the API as the canonical id. Without
      // this, the local Story kept its temporary "ai_<timestamp>" id, so when
      // the user re-opened it from the library the reader thought it was an
      // unsaved freshly-generated story → prompted to save again → duplicate
      // row in Supabase. The reader checks `!story.id.startsWith("ai_")` to
      // decide whether to prompt, so we MUST swap the id here.
      //
      // Also pull out the persisted audio_urls + word_timings the server
      // generated during save, so the reader can immediately use them for
      // future playback without re-hitting /api/tts.
      let savedId: string | null = null;
      let savedAudioUrls: (string | null)[] | undefined;
      let savedWordTimings: (import("@/types/story").WordTiming[] | null)[] | undefined;
      try {
        const saved = await res.json();
        if (saved?.id) savedId = saved.id as string;
        if (Array.isArray(saved?.audio_urls)) savedAudioUrls = saved.audio_urls;
        if (Array.isArray(saved?.word_timings)) savedWordTimings = saved.word_timings;
      } catch {
        // A 2xx with an unparseable body shouldn't happen, but if it does
        // we keep the optimistic entry rather than rolling back.
      }

      const persisted: Story = {
        ...optimistic,
        id: savedId ?? optimisticId,
        audioUrls: savedAudioUrls ?? optimistic.audioUrls,
        wordTimings: savedWordTimings ?? optimistic.wordTimings,
      };

      // Replace the optimistic entry (matched by temp id) with the real
      // persisted row. This swaps in the DB UUID + server-generated audio
      // URLs so future opens can play directly from Supabase Storage.
      setStories((prev) => prev.map((s) => (s.id === optimisticId ? persisted : s)));
      // Also update the reader's current story so if the user is still
      // reading, the hydrated audio URLs take effect immediately.
      setCur((prev) => (prev && prev.id === optimisticId ? persisted : prev));
    } catch (err) {
      console.error("Failed to save story:", err);
      // Roll back the optimistic insert so the user isn't left with a
      // broken entry in "My Stories" pointing at a story the server never
      // saved. We match by the temp id so a parallel save of a different
      // story can't be affected.
      setStories((prev) => prev.filter((s) => s.id !== optimisticId));
      setCur((prev) => (prev && prev.id === optimisticId ? cur : prev));
      // Re-throw so the reader's handleSave catch block runs and flips its
      // "Saved ✓" state back to "Save to My Library". Without this, the UI
      // would keep claiming the save succeeded even though we just undid it.
      throw err;
    }
  };

  // Show loading spinner while Clerk and local data load
  if (!clerkLoaded || !loaded) {
    return (
      <div className="generating">
        <div className="spinner" />
        <p style={{ color: "var(--muted)", fontWeight: 600 }}>Loading…</p>
      </div>
    );
  }

  // Not signed in — show welcome screen with sign-in
  if (!isSignedIn) {
    return (
      <div className="app">
        <div className="welcome-screen">
          <div style={{ fontSize: 64 }}>📚</div>
          <h1>StoryTime</h1>
          <p>Personalized read-along stories for kids ages 2–10</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
            <SignInButton mode="modal">
              <button className="pill-btn primary" style={{ width: "100%", padding: 16, fontSize: 18 }}>
                Get Started
              </button>
            </SignInButton>
            <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
              5 free stories included. No credit card required.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Signed in but on profile selection screen
  if (screen === "profiles" && !activeProfile) {
    return (
      <div className="app">
        <div className="header">
          <div />
          <div className="header-btns">
            <UserButton />
          </div>
        </div>
        <ProfileSelector
          profiles={profiles}
          onSelect={handleSelectProfile}
          onCreate={handleCreateProfile}
        />
      </div>
    );
  }

  return (
    <div className={`app ${screen === "reader" ? "app-reading" : ""}`}>
      {screen === "library" && (
        <LibraryScreen
          stories={stories}
          readingHistory={readingHistory}
          onSelect={handleSelect}
          onCreateNew={() => setScreen("builder")}
          onDeleteStory={handleDeleteStory}
          setShowVoice={setShowVoice}
          isPremium={isPremium}
          freeStoryLimit={FREE_STORY_LIMIT}
          activeProfile={activeProfile}
          onSwitchProfile={handleBackToProfiles}
        />
      )}
      {screen === "reader" && cur && (
        <ReaderScreen story={cur} onBack={handleBack} speech={speech} sfx={sfx} onSave={cur.generated ? handleSaveStory : undefined} />
      )}
      {screen === "builder" && (
        <BuilderScreen onBack={() => setScreen("library")} onStoryCreated={handleCreated} />
      )}
      <VoiceModal
        show={showVoice}
        onClose={() => setShowVoice(false)}
        voiceMode={speech.voiceMode}
        setVoiceMode={speech.setVoiceMode}
        aiVoice={speech.aiVoice}
        setAiVoice={speech.setAiVoice}
        aiSpeed={speech.aiSpeed}
        setAiSpeed={speech.setAiSpeed}
        allVoices={speech.allVoices}
        voice={speech.voice}
        setVoice={speech.setVoice}
        rate={speech.rate}
        setRate={speech.setRate}
      />
    </div>
  );
}
