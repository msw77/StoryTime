"use client";

import { useState } from "react";

interface ChildProfile {
  id: string;
  name: string;
  age: number | null;
  avatar_emoji: string;
}

interface ProfileSelectorProps {
  profiles: ChildProfile[];
  onSelect: (profile: ChildProfile) => void;
  onCreate: (name: string, age: number, emoji: string) => void;
}

const AVATARS = ["🧒", "👧", "👦", "🧒🏽", "👧🏾", "👦🏼", "🐱", "🐶", "🦄", "🐻", "🐰", "🐸"];

export function ProfileSelector({ profiles, onSelect, onCreate }: ProfileSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("4");
  const [emoji, setEmoji] = useState("🧒");
  const [error, setError] = useState("");

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Give your child a name!");
      return;
    }
    onCreate(name.trim(), parseInt(age), emoji);
    setName("");
    setAge("4");
    setEmoji("🧒");
    setShowCreate(false);
    setError("");
  };

  return (
    <div className="profile-selector">
      <h1>📚 StoryTime</h1>
      <h2>Who&apos;s reading today?</h2>

      <div className="profile-grid">
        {profiles.map((p) => (
          <div key={p.id} className="profile-card" onClick={() => onSelect(p)}>
            <div className="profile-avatar">{p.avatar_emoji}</div>
            <div className="profile-name">{p.name}</div>
            {p.age && <div className="profile-age">Age {p.age}</div>}
          </div>
        ))}
        <div className="profile-card add-profile" onClick={() => setShowCreate(true)}>
          <div className="profile-avatar">➕</div>
          <div className="profile-name">Add Child</div>
        </div>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add a Child Profile</h3>
            {error && <div className="error-msg">{error}</div>}
            <div className="builder-section">
              <label>Child&apos;s Name</label>
              <input
                type="text"
                placeholder="e.g. Emma, Max…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: "2px solid #e8e4dc", fontFamily: "var(--font-nunito), Inter, sans-serif", fontSize: 15, fontWeight: 600, background: "var(--card)", outline: "none" }}
              />
            </div>
            <div className="builder-section">
              <label>Age</label>
              <select
                value={age}
                onChange={(e) => setAge(e.target.value)}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: "2px solid #e8e4dc", fontFamily: "var(--font-nunito), Inter, sans-serif", fontSize: 15, fontWeight: 600, background: "var(--card)", outline: "none" }}
              >
                {Array.from({ length: 9 }, (_, i) => i + 2).map((a) => (
                  <option key={a} value={a}>
                    {a} years old
                  </option>
                ))}
              </select>
            </div>
            <div className="builder-section">
              <label>Avatar</label>
              <div className="pill-row">
                {AVATARS.map((e) => (
                  <button
                    key={e}
                    className={`pill ${emoji === e ? "active" : ""}`}
                    style={emoji === e ? { background: "var(--accent)", fontSize: 24, padding: "8px 12px" } : { fontSize: 24, padding: "8px 12px" }}
                    onClick={() => setEmoji(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button className="pill-btn secondary" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="pill-btn primary" style={{ flex: 1 }} onClick={handleCreate}>
                Add Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
