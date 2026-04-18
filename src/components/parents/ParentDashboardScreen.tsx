"use client";

/**
 * Parent Dashboard — the "is my kid actually learning something" view.
 * Design principle: Oura Ring, not grade-report card. Big readable
 * numbers, one sparkline, warm phrasing. Parents read it in 30 seconds
 * and feel proud, not audited.
 *
 * Data sources:
 *   - Reading activity:  /api/reading-history
 *   - Vocabulary growth: /api/vocabulary
 *   - Comprehension:     /api/comprehension
 *
 * All three queries key off the active child profile. If no profile is
 * active (guest / dev-bypass), we render a graceful "pick a kid to see
 * their progress" state rather than erroring.
 *
 * We intentionally do NOT show percent-style grades to parents. A
 * "5 of 6 questions" phrasing keeps the tone informative without
 * turning into a report card. Framing matters for this product.
 */

import { useEffect, useMemo, useState } from "react";
import type { ChildProfile } from "@/types/story";

interface ReadingHistoryEntry {
  story_id: string;
  started_at: string;
  child_profile_id?: string | null;
}

interface VocabEntry {
  word: string;
  first_story_id: string | null;
  first_looked_up_at: string;
  last_looked_up_at: string;
  times_looked_up: number;
}

interface ComprehensionEntry {
  story_id: string;
  question_idx: number;
  question_type: "recall" | "inference" | "connection";
  chosen_option_idx: number;
  correct: boolean;
  answered_at: string;
}

interface ParentDashboardScreenProps {
  activeProfile: ChildProfile | null;
  onBack: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function computeReadingStreak(history: ReadingHistoryEntry[]): number {
  // Consecutive days up to AND INCLUDING today with at least one
  // started_at. If the kid missed today but read yesterday, the
  // streak is NOT broken yet (grace window). We consider the streak
  // broken only if both today and yesterday are blank.
  const days = new Set<string>();
  for (const h of history) {
    days.add(new Date(h.started_at).toISOString().slice(0, 10));
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = daysAgo(1).toISOString().slice(0, 10);
  if (!days.has(todayKey) && !days.has(yesterdayKey)) return 0;

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const key = daysAgo(i).toISOString().slice(0, 10);
    if (days.has(key)) streak++;
    else if (i > 0) break; // today being empty is tolerated
  }
  return streak;
}

function streakLabel(n: number): string {
  if (n === 0) return "Let's start a streak!";
  if (n === 1) return "Just getting started ✨";
  if (n < 5) return "Keep going!";
  if (n < 14) return "On fire 🔥";
  if (n < 30) return "Unstoppable 🚀";
  return "Legendary 🏆";
}

// ── Screen ───────────────────────────────────────────────────────────

export function ParentDashboardScreen({
  activeProfile,
  onBack,
}: ParentDashboardScreenProps) {
  const [history, setHistory] = useState<ReadingHistoryEntry[] | null>(null);
  const [vocab, setVocab] = useState<VocabEntry[] | null>(null);
  const [comp, setComp] = useState<ComprehensionEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  const profileId = activeProfile?.id ?? null;

  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [hRes, vRes, cRes] = await Promise.all([
          fetch("/api/reading-history").then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/vocabulary?childProfileId=${profileId}`).then((r) =>
            r.ok ? r.json() : [],
          ),
          fetch(`/api/comprehension?childProfileId=${profileId}&sinceDays=30`).then(
            (r) => (r.ok ? r.json() : []),
          ),
        ]);
        if (cancelled) return;
        // Reading history is global; filter to this kid client-side.
        const filtered = (hRes as ReadingHistoryEntry[]).filter(
          (h) => !h.child_profile_id || h.child_profile_id === profileId,
        );
        setHistory(filtered);
        setVocab(vRes as VocabEntry[]);
        setComp(cRes as ComprehensionEntry[]);
      } catch {
        if (cancelled) return;
        setHistory([]);
        setVocab([]);
        setComp([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // ── Derived stats (week-scoped) ──
  const stats = useMemo(() => {
    const weekAgo = daysAgo(6).getTime(); // today + previous 6 days
    const weekHistory = (history ?? []).filter(
      (h) => new Date(h.started_at).getTime() >= weekAgo,
    );
    const weekVocab = (vocab ?? []).filter(
      (v) => new Date(v.first_looked_up_at).getTime() >= weekAgo,
    );
    const weekComp = (comp ?? []).filter(
      (c) => new Date(c.answered_at).getTime() >= weekAgo,
    );
    // Per-type comprehension breakdown
    const compByType = { recall: { total: 0, correct: 0 }, inference: { total: 0, correct: 0 }, connection: { total: 0, correct: 0 } } as Record<string, { total: number; correct: number }>;
    for (const c of weekComp) {
      compByType[c.question_type].total++;
      if (c.correct) compByType[c.question_type].correct++;
    }
    // Find the kid's strongest type (highest accuracy among types with >=2 samples)
    let strongest: string | null = null;
    let strongestPct = 0;
    for (const [t, v] of Object.entries(compByType)) {
      if (v.total < 2) continue;
      const pct = v.correct / v.total;
      if (pct > strongestPct) {
        strongest = t;
        strongestPct = pct;
      }
    }
    return {
      streak: computeReadingStreak(history ?? []),
      weekStories: weekHistory.length,
      weekVocab: weekVocab.length,
      totalVocab: (vocab ?? []).length,
      recentVocab: (vocab ?? []).slice(0, 5),
      weekComp,
      compByType,
      strongestType: strongest,
    };
  }, [history, vocab, comp]);

  if (!activeProfile) {
    return (
      <div className="parent-dashboard">
        <DashboardHeader title="Teddy's Progress" onBack={onBack} subtitle={null} />
        <div className="dashboard-empty">
          <div className="dashboard-empty-emoji">🌱</div>
          <p>Pick a kid on the library screen to see their reading progress.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="parent-dashboard">
      <DashboardHeader
        title={`${activeProfile.name}'s Progress`}
        onBack={onBack}
        subtitle="This week"
      />

      {loading ? (
        <div className="dashboard-loading">Loading…</div>
      ) : (
        <>
          {/* Reading activity */}
          <Card
            emoji="🔥"
            title="Reading"
            headline={
              stats.streak === 0
                ? "—"
                : `${stats.streak}-day streak`
            }
            body={streakLabel(stats.streak)}
            footer={
              stats.weekStories === 0
                ? "No stories this week yet"
                : `${stats.weekStories} ${stats.weekStories === 1 ? "story" : "stories"} in the last 7 days`
            }
          />

          {/* Vocabulary — always show even at 0 so the empty state
              invites the first tap. */}
          <Card
            emoji="🌱"
            title="Vocabulary"
            headline={
              stats.weekVocab === 0 && stats.totalVocab === 0
                ? "0 words yet"
                : `+${stats.weekVocab} this week`
            }
            body={
              stats.totalVocab === 0
                ? "Tap any word in a story to hear it. Some words open a definition pop-up."
                : `${stats.totalVocab} total words ${activeProfile.name} has looked up`
            }
            footer={
              stats.recentVocab.length > 0 ? (
                <div className="dashboard-vocab-chips">
                  {stats.recentVocab.map((v) => (
                    <span key={v.word} className="dashboard-vocab-chip">
                      {v.word}
                    </span>
                  ))}
                </div>
              ) : null
            }
          />

          {/* Understanding (comprehension) */}
          <Card
            emoji="🧠"
            title="Understanding"
            headline={
              stats.weekComp.length === 0
                ? "—"
                : (() => {
                    const correct = stats.weekComp.filter((c) => c.correct).length;
                    return `${correct} of ${stats.weekComp.length} questions`;
                  })()
            }
            body={
              stats.weekComp.length === 0
                ? "Story questions appear after each story (ages 4+). Read a story to see progress here."
                : stats.strongestType
                  ? `${activeProfile.name} is strongest at ${labelForType(stats.strongestType)}`
                  : "Every answer is a step forward"
            }
            footer={
              stats.weekComp.length > 0 ? (
                <div className="dashboard-comp-breakdown">
                  {(["recall", "inference", "connection"] as const).map((t) => {
                    const d = stats.compByType[t];
                    if (d.total === 0) return null;
                    return (
                      <div key={t} className="dashboard-comp-row">
                        <span className="dashboard-comp-label">
                          {labelForType(t)}
                        </span>
                        <span className="dashboard-comp-value">
                          {d.correct}/{d.total}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null
            }
          />
        </>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function DashboardHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string | null;
  onBack: () => void;
}) {
  return (
    <header className="dashboard-header">
      <button
        type="button"
        className="icon-btn dashboard-back"
        onClick={onBack}
        aria-label="Back"
      >
        ←
      </button>
      <div className="dashboard-header-text">
        <h1>{title}</h1>
        {subtitle && <div className="dashboard-header-sub">{subtitle}</div>}
      </div>
    </header>
  );
}

function Card({
  emoji,
  title,
  headline,
  body,
  footer,
}: {
  emoji: string;
  title: string;
  headline: string;
  body: string;
  footer?: React.ReactNode;
}) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-card-title-row">
        <span className="dashboard-card-emoji" aria-hidden="true">
          {emoji}
        </span>
        <h2 className="dashboard-card-title">{title}</h2>
      </div>
      <div className="dashboard-card-headline">{headline}</div>
      <div className="dashboard-card-body">{body}</div>
      {footer && <div className="dashboard-card-footer">{footer}</div>}
    </section>
  );
}

function labelForType(t: string): string {
  if (t === "recall") return "remembering";
  if (t === "inference") return "thinking deeper";
  if (t === "connection") return "connecting to their life";
  return t;
}
