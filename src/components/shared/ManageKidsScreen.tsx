"use client";

import { useState } from "react";
import type { ChildProfile } from "@/types/story";

interface ManageKidsScreenProps {
  profiles: ChildProfile[];
  /** Map of profile id → number of custom stories saved under that kid.
   *  Used in the delete-confirm dialog so the parent knows exactly how
   *  many stories will be deleted along with the profile. */
  storyCounts?: Record<string, number>;
  onBack: () => void;
  onCreate: (name: string, age: number, emoji: string) => void;
  onDelete: (profileId: string) => void;
  onUpdateAge: (profileId: string, age: number) => void;
}

/**
 * Dedicated "Manage Kids" screen — accessed from the library header's
 * kid-picker dropdown. Simpler than ProfileSelector: shows each kid as
 * a compact row where the parent can bump their age up/down and delete
 * the profile. "Add Child" opens the same create modal used elsewhere.
 *
 * Names and avatars are locked once created — only age is editable
 * here. That matches the mental model of "kids grow up, they don't
 * change species mid-year".
 */
export function ManageKidsScreen({
  profiles,
  storyCounts = {},
  onBack,
  onCreate,
  onDelete,
  onUpdateAge,
}: ManageKidsScreenProps) {
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
    <>
      <div className="header">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1 className="subview-title">Manage Kids</h1>
        <div className="header-btns" />
      </div>

      <div className="manage-kids-list">
        {profiles.length === 0 ? (
          <div className="storybook-empty" style={{ padding: "32px 20px" }}>
            <div style={{ fontSize: 48 }}>👶</div>
            <h2 style={{ fontSize: 18 }}>No kids yet</h2>
            <p style={{ fontSize: 14 }}>
              Add your first child to get started.
            </p>
          </div>
        ) : (
          profiles.map((p) => (
            <div key={p.id} className="manage-kids-row">
              <div className="manage-kids-avatar">{p.avatar_emoji}</div>
              <div className="manage-kids-info">
                <div className="manage-kids-name">{p.name}</div>
                <div className="manage-kids-age-wrap">
                  <label className="manage-kids-age-label" htmlFor={`age-${p.id}`}>
                    Age
                  </label>
                  <select
                    id={`age-${p.id}`}
                    className="manage-kids-age-select"
                    value={p.age ?? ""}
                    onChange={(e) => {
                      const newAge = parseInt(e.target.value, 10);
                      if (!Number.isNaN(newAge)) onUpdateAge(p.id, newAge);
                    }}
                  >
                    {Array.from({ length: 16 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                className="manage-kids-delete"
                onClick={() => {
                  const count = storyCounts[p.id] ?? 0;
                  const storyClause =
                    count === 0
                      ? ""
                      : count === 1
                        ? ` Their 1 saved story will also be deleted.`
                        : ` Their ${count} saved stories will also be deleted.`;
                  if (confirm(`Remove ${p.name}'s profile?${storyClause} This can't be undone.`)) {
                    onDelete(p.id);
                  }
                }}
                aria-label={`Remove ${p.name}`}
                title={`Remove ${p.name}`}
              >
                ✕
              </button>
            </div>
          ))
        )}

        <button
          type="button"
          className="manage-kids-add"
          onClick={() => setShowCreate(true)}
        >
          <span className="manage-kids-add-icon">+</span>
          Add a Child
        </button>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add a Child</h3>
            {error && <div className="error-msg">{error}</div>}
            <div className="builder-section">
              <label>Name</label>
              <input
                type="text"
                placeholder="e.g. Emma, Max…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "2px solid #e8e4dc",
                  fontFamily: "var(--font-nunito), Inter, sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  background: "var(--card)",
                  outline: "none",
                }}
              />
            </div>
            <div className="builder-section">
              <label>Age</label>
              <select
                value={age}
                onChange={(e) => setAge(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "2px solid #e8e4dc",
                  fontFamily: "var(--font-nunito), Inter, sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  background: "var(--card)",
                  outline: "none",
                }}
              >
                {Array.from({ length: 16 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="builder-section">
              <label>Avatar</label>
              <div className="avatar-row">
                {["🧒", "👧", "👦", "🧒🏽", "👧🏾", "👦🏼", "🐱", "🐶", "🦄", "🐻", "🐰", "🐸"].map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`avatar-btn${emoji === a ? " active" : ""}`}
                    onClick={() => setEmoji(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="pill-btn"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button className="pill-btn primary" onClick={handleCreate}>
                Add Child
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
