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
            const mapped: Story[] = savedStories.map((s: { id: string; title: string; emoji: string; genre: string; age_group: string; pages: string | [string, string][]; page_count: number }) => {
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

  const handleSaveStory = async () => {
    if (!cur) return;
    try {
      await fetch("/api/stories", {
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
        }),
      });
      // Add to local stories list so it shows up right away
      setStories((prev) => [{ ...cur, generated: true }, ...prev]);
    } catch (err) {
      console.error("Failed to save story:", err);
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
