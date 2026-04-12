"use client";

import { useState, useEffect } from "react";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import { Story } from "@/types/story";
import { ALL_STORIES } from "@/data/stories";
import { useSpeech } from "@/hooks/useSpeech";
import { loadSaved, saveToDisk } from "@/lib/storage";
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
  const [isPremium, setIsPremium] = useState(false);
  const speech = useSpeech();

  // Load saved stories from local storage
  useEffect(() => {
    loadSaved().then((saved) => {
      if (saved.length) setStories([...saved, ...ALL_STORIES]);
      setLoaded(true);
    });
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
          setIsPremium(userData.subscription_status === "premium" || userData.subscription_status === "family");
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
  };

  const handleBack = () => {
    setScreen("library");
    setCur(null);
  };

  const handleBackToProfiles = () => {
    setActiveProfile(null);
    setScreen("profiles");
  };

  const handleCreated = async (s: Story) => {
    setStories((prev) => {
      const next = [s, ...prev];
      saveToDisk(next.filter((x) => x.generated));
      return next;
    });
    setCur(s);
    setScreen("reader");
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
    <div className="app">
      {screen === "library" && (
        <LibraryScreen
          stories={stories}
          onSelect={handleSelect}
          onCreateNew={() => setScreen("builder")}
          setShowVoice={setShowVoice}
          isPremium={isPremium}
          freeStoryLimit={FREE_STORY_LIMIT}
          activeProfile={activeProfile}
          onSwitchProfile={handleBackToProfiles}
        />
      )}
      {screen === "reader" && cur && (
        <ReaderScreen story={cur} onBack={handleBack} speech={speech} />
      )}
      {screen === "builder" && (
        <BuilderScreen onBack={() => setScreen("library")} onStoryCreated={handleCreated} />
      )}
      <VoiceModal
        show={showVoice}
        onClose={() => setShowVoice(false)}
        allVoices={speech.allVoices}
        voice={speech.voice}
        setVoice={speech.setVoice}
        rate={speech.rate}
        setRate={speech.setRate}
      />
    </div>
  );
}
