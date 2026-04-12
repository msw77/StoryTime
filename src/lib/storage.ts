import { Story } from "@/types/story";

declare global {
  interface Window {
    storage?: {
      get: (key: string) => Promise<{ value: string } | null>;
      set: (key: string, value: string) => Promise<void>;
    };
  }
}

export async function loadSaved(): Promise<Story[]> {
  try {
    // Try Capacitor storage first, fall back to localStorage
    if (window.storage) {
      const r = await window.storage.get("saved-stories");
      return r ? JSON.parse(r.value) : [];
    }
    const r = localStorage.getItem("saved-stories");
    return r ? JSON.parse(r) : [];
  } catch {
    return [];
  }
}

export async function saveToDisk(stories: Story[]): Promise<void> {
  try {
    if (window.storage) {
      await window.storage.set("saved-stories", JSON.stringify(stories));
    } else {
      localStorage.setItem("saved-stories", JSON.stringify(stories));
    }
  } catch (e) {
    console.error("Save failed:", e);
  }
}
