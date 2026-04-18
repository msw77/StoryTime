"use client";

/**
 * Word-Highlight Debug Overlay — Phase 0 tooling
 *
 * A floating panel that renders only when ?hl=1 is in the URL. Listens to
 * the highlightDiagnostics event bus and shows:
 *   - Live readout: current audio time, which Whisper token we're on,
 *     which display word is highlighted, current frame drift (color-coded
 *     green/yellow/red so you can see misalignment without reading numbers).
 *   - Summary stats: count, mean, median, p95, max |drift|, plus a count
 *     of samples that exceeded our 80ms target and our 200ms catastrophe
 *     threshold.
 *   - Scrolling log: last 40 word-transition samples.
 *   - Actions: Clear (reset in-panel stats), Copy CSV (paste a full run
 *     into chat so we can analyze it together).
 *
 * This component is intentionally NOT styled with globals.css — all styles
 * are inline so it stays visually independent of the app's design tokens
 * and can't be affected by cozy-mode / dark-mode overrides. It also means
 * zero churn to globals.css for a purely developer-facing tool.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  subscribe,
  samplesToCsv,
  computeStats,
  type DriftSample,
} from "@/lib/highlightDiagnostics";

const MAX_SAMPLES = 1000;
const RECENT_VISIBLE = 40;

function driftColor(ms: number): string {
  const a = Math.abs(ms);
  if (a < 40) return "#1f9d55";  // green — excellent
  if (a < 80) return "#b7791f";  // amber — acceptable
  if (a < 200) return "#c05621"; // orange — noticeable
  return "#c53030";              // red — catastrophic
}

export function HighlightDebugOverlay() {
  // Live latest sample shown in the big readout panel. Kept in state so
  // React re-renders on each word change; the full sample log is stored
  // in a ref to avoid 1000-item re-renders of the whole panel.
  const [latest, setLatest] = useState<DriftSample | null>(null);
  const samplesRef = useRef<DriftSample[]>([]);
  // Force re-render of stats/list on a throttle (every sample is fine —
  // samples fire on word transitions, not every frame, so this is ~1-3 Hz).
  const [tick, setTick] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribe((s) => {
      samplesRef.current.push(s);
      if (samplesRef.current.length > MAX_SAMPLES) {
        samplesRef.current.shift();
      }
      setLatest(s);
      setTick((t) => t + 1);
    });
    return unsub;
  }, []);

  const handleClear = useCallback(() => {
    samplesRef.current = [];
    setLatest(null);
    setTick((t) => t + 1);
  }, []);

  const handleCopy = useCallback(async () => {
    const csv = samplesToCsv(samplesRef.current);
    try {
      await navigator.clipboard.writeText(csv);
      setCopyStatus(`Copied ${samplesRef.current.length} rows`);
    } catch {
      // Fallback: stash on window so devtools can grab it.
      (window as unknown as { __hl_csv?: string }).__hl_csv = csv;
      setCopyStatus("Clipboard blocked — run window.__hl_csv in console");
    }
    setTimeout(() => setCopyStatus(null), 2500);
  }, []);

  const stats = computeStats(samplesRef.current);
  const recent = samplesRef.current.slice(-RECENT_VISIBLE).reverse();

  // Container is fixed top-right, high z-index, click-through-safe (content
  // area is opaque but the page behind is still reachable around the panel).
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 10000,
    width: collapsed ? 220 : 420,
    maxHeight: "80vh",
    background: "rgba(12, 15, 22, 0.94)",
    color: "#f5f5f0",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 11,
    lineHeight: 1.4,
    borderRadius: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden",
    userSelect: "text",
  };

  const headerStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: "rgba(255,255,255,0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#9ca3af",
  };

  const sectionStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "2px 0",
  };

  const buttonStyle: React.CSSProperties = {
    flex: 1,
    padding: "6px 10px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#f5f5f0",
    borderRadius: 6,
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div style={panelStyle} data-debug-overlay="highlight">
      <div style={headerStyle} onClick={() => setCollapsed((c) => !c)}>
        <span>[hl] drift monitor</span>
        <span style={{ opacity: 0.6 }}>{collapsed ? "▸" : "▾"}</span>
      </div>

      {!collapsed && (
        <>
          {/* Live readout — the biggest block so you can see it from 5ft away */}
          <div style={sectionStyle}>
            {latest ? (
              <>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: driftColor(latest.driftMs),
                    textAlign: "center",
                    marginBottom: 6,
                  }}
                >
                  {latest.driftMs >= 0 ? "+" : ""}
                  {latest.driftMs.toFixed(0)} ms
                </div>
                <div style={rowStyle}>
                  <span style={{ opacity: 0.6 }}>display</span>
                  <span>
                    [{latest.displayIdx}] "{latest.displayWord}"
                  </span>
                </div>
                <div style={rowStyle}>
                  <span style={{ opacity: 0.6 }}>whisper</span>
                  <span>
                    [{latest.whisperIdx}] "{latest.whisperWord}"
                  </span>
                </div>
                <div style={rowStyle}>
                  <span style={{ opacity: 0.6 }}>whisper.start</span>
                  <span>{latest.whisperStart.toFixed(3)}s</span>
                </div>
                <div style={rowStyle}>
                  <span style={{ opacity: 0.6 }}>audio.time</span>
                  <span>{latest.audioTime.toFixed(3)}s</span>
                </div>
                <div style={rowStyle}>
                  <span style={{ opacity: 0.6 }}>playbackRate</span>
                  <span>{latest.playbackRate.toFixed(2)}x</span>
                </div>
              </>
            ) : (
              <div style={{ opacity: 0.5, textAlign: "center", padding: "20px 0" }}>
                Press play to start capturing…
              </div>
            )}
          </div>

          {/* Summary stats */}
          {stats && (
            <div style={sectionStyle}>
              <div
                style={{
                  fontSize: 10,
                  opacity: 0.6,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                summary — {stats.count} samples
              </div>
              <div style={rowStyle}>
                <span style={{ opacity: 0.6 }}>mean</span>
                <span>{stats.meanMs.toFixed(1)} ms</span>
              </div>
              <div style={rowStyle}>
                <span style={{ opacity: 0.6 }}>median |drift|</span>
                <span style={{ color: driftColor(stats.medianMs) }}>
                  {stats.medianMs.toFixed(1)} ms
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ opacity: 0.6 }}>p95 |drift|</span>
                <span style={{ color: driftColor(stats.p95Ms) }}>
                  {stats.p95Ms.toFixed(1)} ms
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ opacity: 0.6 }}>max |drift|</span>
                <span style={{ color: driftColor(stats.maxMs) }}>
                  {stats.maxMs.toFixed(1)} ms
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ opacity: 0.6 }}>&gt;80ms</span>
                <span>{stats.overThreshold80}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ opacity: 0.6 }}>&gt;200ms</span>
                <span
                  style={{
                    color: stats.overThreshold200 > 0 ? "#c53030" : "#1f9d55",
                  }}
                >
                  {stats.overThreshold200}
                </span>
              </div>
            </div>
          )}

          {/* Recent log */}
          <div style={{ ...sectionStyle, maxHeight: 200, overflowY: "auto" }}>
            <div
              style={{
                fontSize: 10,
                opacity: 0.6,
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              last {Math.min(RECENT_VISIBLE, recent.length)} transitions
            </div>
            {recent.length === 0 ? (
              <div style={{ opacity: 0.4, fontSize: 10 }}>No samples yet.</div>
            ) : (
              recent.map((s) => (
                <div
                  key={s.seq}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 1fr 56px",
                    gap: 6,
                    fontSize: 10,
                    padding: "1px 0",
                  }}
                >
                  <span style={{ opacity: 0.5 }}>{s.displayIdx}</span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.displayWord}
                  </span>
                  <span
                    style={{
                      color: driftColor(s.driftMs),
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {s.driftMs >= 0 ? "+" : ""}
                    {s.driftMs.toFixed(0)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Actions */}
          <div style={{ ...sectionStyle, display: "flex", gap: 6 }}>
            <button style={buttonStyle} onClick={handleClear} type="button">
              Clear
            </button>
            <button style={buttonStyle} onClick={handleCopy} type="button">
              Copy CSV
            </button>
          </div>
          {copyStatus && (
            <div
              style={{
                padding: "6px 12px",
                background: "rgba(31,157,85,0.15)",
                color: "#86efac",
                fontSize: 10,
                textAlign: "center",
              }}
            >
              {copyStatus}
            </div>
          )}
        </>
      )}
    </div>
  );
}
