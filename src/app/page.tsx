"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { SignInButton, UserButton } from "@/components/shared/ClerkSafe";
import { Story } from "@/types/story";
import { ALL_STORIES } from "@/data/stories";
import { GENRES } from "@/data/genres";
import { useSpeech } from "@/hooks/useSpeech";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { LibraryScreen } from "@/components/library/LibraryScreen";
import { ReaderScreen } from "@/components/reader/ReaderScreen";
import { BuilderScreen } from "@/components/builder/BuilderScreen";
import { LoadingScreen } from "@/components/builder/LoadingScreen";
import { VoiceModal } from "@/components/shared/VoiceModal";
import { ParentSettingsModal } from "@/components/shared/ParentSettingsModal";
import { ProfileSelector } from "@/components/shared/ProfileSelector";
import { ManageKidsScreen } from "@/components/shared/ManageKidsScreen";
import { ParentDashboardScreen } from "@/components/parents/ParentDashboardScreen";
import { useEffectsPref } from "@/hooks/useEffectsPref";
import { useComprehensionPref } from "@/hooks/useComprehensionPref";
import { loadDraft, clearDraft } from "@/lib/draftStory";
import { generateStoryFlow, type GenerateStoryFormValues } from "@/lib/generateStory";
import type { ChildProfile } from "@/types/story";

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

const FREE_STORY_LIMIT = 5;

// Dev preview auth bypass — see src/lib/devBypass.ts.
// (dev only). Lets the Claude Code preview browser load the home page
// without redirecting to Clerk's hosted sign-in — which the preview tool
// blocks because it only permits localhost URLs. The bypass injects a
// mock premium user + a single mock child profile.
import { DEV_AUTH_BYPASS } from "@/lib/devBypass";

// Wrapper around Clerk's useUser that returns a mock signed-in state in
// bypass mode. Because DEV_AUTH_BYPASS is a module-level constant (not
// runtime state), the branch picked here is stable across every render
// — React's rules-of-hooks are satisfied even though useUser isn't
// always called. In bypass mode useUser is never invoked, which is
// important because ClerkProvider is also skipped in that mode and the
// real hook would throw without a provider in the tree.
function useAuthState(): { isLoaded: boolean; isSignedIn: boolean } {
  if (DEV_AUTH_BYPASS) {
    return { isLoaded: true, isSignedIn: true };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const clerk = useUser();
  return { isLoaded: !!clerk.isLoaded, isSignedIn: !!clerk.isSignedIn };
}

export default function Home() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuthState();
  const [screen, setScreen] = useState<"profiles" | "library" | "reader" | "builder" | "loading" | "manage-kids" | "parent-dashboard">("profiles");
  const [cur, setCur] = useState<Story | null>(null);
  const [stories, setStories] = useState<Story[]>(ALL_STORIES);
  const [showVoice, setShowVoice] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [effectsEnabled, setEffectsEnabled] = useEffectsPref();
  const [comprehensionEnabled, setComprehensionEnabled] = useComprehensionPref();
  const [loaded, setLoaded] = useState(false);
  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ChildProfile | null>(null);
  const [isPremium, setIsPremium] = useState(true); // TODO: remove dev override — temporarily true to test builder
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry[]>([]);
  const speech = useSpeech();
  const sfx = useSoundEffects();

  // ── Custom-story generation state (lifted from BuilderScreen) ──────
  // These live here so the async pipeline can survive the user leaving
  // the LoadingScreen. `generating` is true for the whole lifetime of
  // an in-flight generation; `detachedRef` flips to true when the user
  // taps "Read something else" and tells the completion handler to
  // silently auto-save instead of navigating into the reader.
  const [generating, setGenerating] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"story" | "illustrations">("story");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [generatingHero, setGeneratingHero] = useState<string | undefined>();
  const [generatingGenre, setGeneratingGenre] = useState<string | undefined>();
  const detachedRef = useRef(false);

  // Transient toast shown on successful background save (bottom of the
  // screen, fades out after a few seconds). Independent of sfx.notification
  // so the visual feedback still lands even if audio is blocked on iOS.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Ids of stories that arrived via background save in this session —
  // the library renders a small "new" dot on each until the user opens
  // the story, at which point we remove it from the set.
  const [newStoryIds, setNewStoryIds] = useState<Set<string>>(new Set());

  // Mark as loaded (saved stories now come from database, loaded after sign-in)
  // Also hydrate any unsaved-draft story from localStorage so a reader
  // crash doesn't lose the text. The draft is injected into the local
  // library as an "ai_*" story — opening it goes through the normal save
  // flow, and a successful save calls clearDraft() to remove it.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setStories((prev) => {
        // Guard against a hot-reload re-running this effect and adding
        // the same draft twice.
        if (prev.some((s) => s.id === draft.id)) return prev;
        return [draft, ...prev];
      });
    }
    setLoaded(true);
  }, []);

  // When signed in, fetch user + profiles from our API routes. In dev
  // bypass mode this still runs — the API helpers resolve the bypass
  // user id from Supabase, so the preview sees real profiles, stories,
  // and reading history rather than mock data.
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
              hero_type?: string | null;
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
                heroType: s.hero_type || undefined,
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

  // Delete a child profile AND all their saved stories (the API does
  // the cascade server-side). Confirmation lives in the UI. If the
  // deleted profile was active, we fall back to another profile or
  // bounce back to the profile-picker screen.
  const handleDeleteProfile = async (profileId: string) => {
    try {
      const res = await fetch(`/api/profiles?id=${profileId}`, { method: "DELETE" });
      if (!res.ok) return;
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      // Drop the deleted kid's custom stories from local state so the
      // library reflects the deletion immediately.
      setStories((prev) => prev.filter((s) => s.childProfileId !== profileId));
      setReadingHistory((prev) => prev.filter((h) => h.child_profile_id !== profileId));
      if (activeProfile?.id === profileId) {
        const remaining = profiles.filter((p) => p.id !== profileId);
        if (remaining.length > 0) {
          setActiveProfile(remaining[0]);
        } else {
          setActiveProfile(null);
          setScreen("profiles");
        }
      }
    } catch (err) {
      console.error("Failed to delete profile:", err);
    }
  };

  // Update a child profile's age from the Manage Kids screen. Only age
  // is editable — name + avatar are locked once created.
  const handleUpdateProfileAge = async (profileId: string, newAge: number) => {
    try {
      const res = await fetch(`/api/profiles?id=${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age: newAge }),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as ChildProfile;
      setProfiles((prev) => prev.map((p) => (p.id === profileId ? updated : p)));
      if (activeProfile?.id === profileId) setActiveProfile(updated);
    } catch (err) {
      console.error("Failed to update profile age:", err);
    }
  };

  const handleSelect = (s: Story) => {
    setCur(s);
    setScreen("reader");

    // Clear the "new story" dot once the child actually opens it.
    // We keyed newStoryIds by title (optimistic id vs DB UUID swap
    // makes id matching unreliable across the save lifecycle).
    if (newStoryIds.has(s.title)) {
      setNewStoryIds((prev) => {
        const next = new Set(prev);
        next.delete(s.title);
        return next;
      });
    }

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

  const handleDeleteStory = async (storyId: string) => {
    // Draft stories (still just in localStorage) don't exist on the server,
    // so hitting the delete API would 404. Detect by the "ai_" id prefix,
    // clear the localStorage draft, remove from state, and return.
    if (storyId.startsWith("ai_")) {
      clearDraft();
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      return;
    }
    try {
      const res = await fetch(`/api/stories?id=${storyId}`, { method: "DELETE" });
      if (res.ok) {
        setStories((prev) => prev.filter((s) => s.id !== storyId));
      }
    } catch (err) {
      console.error("Failed to delete story:", err);
    }
  };

  // ── Kick off a custom story generation ──────────────────────────────
  // Called from BuilderScreen with the validated form values. We own
  // the promise here (not inside the builder) so the work can survive
  // the user navigating away from the LoadingScreen.
  const startGeneration = (form: GenerateStoryFormValues) => {
    if (generating) {
      // Should already be blocked at the UI layer, but double-check —
      // concurrent generations would race against handleSaveStory's
      // optimistic insert and make a mess.
      return;
    }
    detachedRef.current = false;
    setGenerating(true);
    setLoadingPhase("story");
    setLoadingProgress(0);
    setGeneratingHero(form.heroName);
    setGeneratingGenre(form.genre);
    setScreen("loading");

    // Fire and forget. The promise resolves on its own timeline; we
    // branch inside the `.then` based on whether the user detached.
    generateStoryFlow(form, {
      onPhase: (p) => setLoadingPhase(p),
      onProgress: (pct) => setLoadingProgress(pct),
      onMark: (label, secs) => console.log(`[StoryTime] ${label}: ${secs.toFixed(1)}s`),
    })
      .then(async ({ story }) => {
        if (detachedRef.current) {
          // ── Detached path ─────────────────────────────────────────
          // The user already left the LoadingScreen. Silently run the
          // save path, mark the new story so the library shows a NEW
          // dot, show a toast, and play the ding. We pass `story` as
          // the override so handleSaveStory doesn't try to read a
          // stale `cur` — and so it doesn't hijack whatever the user
          // is currently reading, if anything.
          try {
            const imgs = story.preloadedImages ?? new Array(story.pages.length).fill(null);
            await handleSaveStory(imgs, story);
            // The optimistic id chosen inside handleSaveStory isn't
            // visible to us, so we can't match it exactly. As a decent
            // proxy, flag every story in state whose title matches and
            // was saved in this burst — close enough for a transient
            // "new" dot. (In practice only one generation is in flight
            // at a time thanks to the concurrency guard.)
            setNewStoryIds((prev) => {
              const next = new Set(prev);
              next.add(story.title);
              return next;
            });
            setToast(`✨ ${story.title} is ready in My Stories!`);
            try { sfx.notification(); } catch { /* iOS may block */ }
          } catch (err) {
            console.error("Background save failed:", err);
            setToast("Hmm — your story finished but couldn't save. Try again?");
          }
        } else {
          // ── Normal path: user waited it out ───────────────────────
          setCur(story);
          setScreen("reader");
        }
      })
      .catch((err) => {
        console.error("Story generation failed:", err);
        if (detachedRef.current) {
          setToast("Your story couldn't finish generating. Try again?");
        } else {
          // Pop back to the builder so the user can retry. They lose
          // the "loading" state but keep whatever they typed — builder
          // state is intact because it never unmounted its form state.
          setScreen("builder");
        }
      })
      .finally(() => {
        setGenerating(false);
        detachedRef.current = false;
      });
  };

  // Called when the user taps "Read something else" on the LoadingScreen.
  // Flips the detach flag and sends them back to the library. The active
  // generation promise keeps running; when it resolves, the .then above
  // notices detachedRef.current === true and takes the background-save
  // branch instead of navigating into the reader.
  const detachGeneration = () => {
    detachedRef.current = true;
    setScreen("library");
  };

  // `storyOverride` lets the background-save path pass the freshly
  // generated story directly, instead of relying on `cur`. The Reader's
  // onSave callback still calls this without the override (storyOverride
  // is undefined), in which case we fall back to reading `cur` the same
  // way as before.
  const handleSaveStory = async (
    imageUrls: (string | null)[],
    storyOverride?: Story,
  ) => {
    const source = storyOverride ?? cur;
    if (!source) return;

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
      ...source,
      id: optimisticId,
      generated: true,
      childProfileId: activeProfile?.id ?? null,
      preloadedImages: imageUrls,
    };
    setStories((prev) => [optimistic, ...prev]);
    // Only swap `cur` if we're saving the currently-open story. When
    // the background-save path provides an override for a story the
    // user isn't actively reading, we leave `cur` alone.
    if (!storyOverride) setCur(optimistic);

    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: source.title,
          emoji: source.emoji,
          genre: source.genre,
          age: source.age,
          pages: source.pages,
          duration: source.duration,
          childProfileId: activeProfile?.id,
          fullPages: source.fullPages,
          characterDescription: source.characterDescription,
          heroType: source.heroType,
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

      // Story is safe in Supabase now — we can drop the localStorage
      // draft. If we didn't, the next app load would re-inject it as a
      // phantom "unsaved" copy next to the real persisted row.
      clearDraft();
    } catch (err) {
      console.error("Failed to save story:", err);
      // Roll back the optimistic insert so the user isn't left with a
      // broken entry in "My Stories" pointing at a story the server never
      // saved. We match by the temp id so a parallel save of a different
      // story can't be affected.
      setStories((prev) => prev.filter((s) => s.id !== optimisticId));
      // Only roll back `cur` if we hijacked it above. The background-save
      // path passes a storyOverride and never touches `cur`, so there's
      // nothing to revert in that case.
      if (!storyOverride) {
        setCur((prev) => (prev && prev.id === optimisticId ? null : prev));
      }
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
          <img
            src="/brand/logo-wordmark.png"
            alt="StoryTime"
            className="brand-wordmark welcome-wordmark"
          />
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
          onDelete={handleDeleteProfile}
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
          setShowSettings={setShowSettings}
          isPremium={isPremium}
          freeStoryLimit={FREE_STORY_LIMIT}
          activeProfile={activeProfile}
          profiles={profiles}
          onSwitchProfile={() => setScreen("manage-kids")}
          onSwitchProfileDirect={setActiveProfile}
          newStoryTitles={newStoryIds}
        />
      )}
      {screen === "reader" && cur && (
        <ReaderScreen
          story={cur}
          onBack={handleBack}
          speech={speech}
          sfx={sfx}
          onSave={cur.generated ? handleSaveStory : undefined}
          effectsEnabled={effectsEnabled}
          childProfileId={activeProfile?.id ?? null}
          comprehensionEnabled={comprehensionEnabled}
        />
      )}
      {screen === "builder" && (
        <BuilderScreen
          onBack={() => setScreen("library")}
          onStartGeneration={startGeneration}
          backgroundBusy={generating}
        />
      )}
      {screen === "loading" && (
        <LoadingScreen
          heroName={generatingHero}
          genre={generatingGenre}
          phase={loadingPhase}
          progress={loadingProgress}
          onDetach={detachGeneration}
        />
      )}
      {screen === "manage-kids" && (
        <ManageKidsScreen
          profiles={profiles}
          storyCounts={stories.reduce((acc, s) => {
            if (s.childProfileId) {
              acc[s.childProfileId] = (acc[s.childProfileId] ?? 0) + 1;
            }
            return acc;
          }, {} as Record<string, number>)}
          onBack={() => setScreen("library")}
          // On the manage screen, creating a kid should NOT bounce back
          // to the library — stay on the manage screen so the parent can
          // continue adding kids or editing ages.
          onCreate={async (name, age, emoji) => {
            try {
              const res = await fetch("/api/profiles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, age, avatar_emoji: emoji }),
              });
              if (res.ok) {
                const profile = await res.json();
                setProfiles((prev) => [...prev, profile]);
              }
            } catch (err) {
              console.error("Failed to create profile from manage screen:", err);
            }
          }}
          onDelete={handleDeleteProfile}
          onUpdateAge={handleUpdateProfileAge}
        />
      )}
      {screen === "parent-dashboard" && (
        <ParentDashboardScreen
          activeProfile={activeProfile}
          onBack={() => setScreen("library")}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      <ParentSettingsModal
        show={showSettings}
        onClose={() => setShowSettings(false)}
        effectsEnabled={effectsEnabled}
        setEffectsEnabled={setEffectsEnabled}
        comprehensionEnabled={comprehensionEnabled}
        setComprehensionEnabled={setComprehensionEnabled}
        onOpenDashboard={() => setScreen("parent-dashboard")}
      />
      <VoiceModal
        show={showVoice}
        onClose={() => setShowVoice(false)}
        isClassic={!!cur?.isClassic}
        aiVoice={speech.aiVoice}
        setAiVoice={speech.setAiVoice}
        aiSpeed={speech.aiSpeed}
        setAiSpeed={speech.setAiSpeed}
      />
    </div>
  );
}
