"use client";

import { useState, useEffect } from "react";
import { Story } from "@/types/story";
import { ALL_STORIES } from "@/data/stories";
import { useSpeech } from "@/hooks/useSpeech";
import { loadSaved, saveToDisk } from "@/lib/storage";
import { LibraryScreen } from "@/components/library/LibraryScreen";
import { ReaderScreen } from "@/components/reader/ReaderScreen";
import { BuilderScreen } from "@/components/builder/BuilderScreen";
import { VoiceModal } from "@/components/shared/VoiceModal";

export default function Home() {
  const [screen, setScreen] = useState<"library" | "reader" | "builder">("library");
  const [cur, setCur] = useState<Story | null>(null);
  const [stories, setStories] = useState<Story[]>(ALL_STORIES);
  const [showVoice, setShowVoice] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const speech = useSpeech();

  useEffect(() => {
    loadSaved().then((saved) => {
      if (saved.length) setStories([...saved, ...ALL_STORIES]);
      setLoaded(true);
    });
  }, []);

  const handleSelect = (s: Story) => {
    setCur(s);
    setScreen("reader");
  };

  const handleBack = () => {
    setScreen("library");
    setCur(null);
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

  if (!loaded) {
    return (
      <div className="generating">
        <div className="spinner" />
        <p style={{ color: "var(--muted)", fontWeight: 600 }}>Loading…</p>
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
