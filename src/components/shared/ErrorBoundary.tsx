"use client";

/**
 * App-level error boundary. Catches any React render error thrown below
 * it and renders a calm fallback instead of unmounting the entire app.
 *
 * Without this, a single crashing component (e.g. a malformed story
 * page, a reader hooks violation, an async import failure) takes down
 * the whole tree and the user sees a blank page. With this in place,
 * they see "something went wrong" + a Reload button, and the rest of
 * the app — auth state, localStorage prefs — is preserved.
 *
 * Placement: wrap the root at src/app/layout.tsx so every route is
 * covered. A future iteration could add per-route boundaries so a
 * reader crash doesn't blank out the library header, but app-wide is
 * the right first line of defense.
 *
 * Why a class component: React's error-boundary lifecycle hooks
 * (getDerivedStateFromError, componentDidCatch) still only exist on
 * class components. No hooks equivalent as of React 19. This is the
 * narrow exception where class components are still required.
 */

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback. Defaults to the warm "Something went
   *  wrong" screen. */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for now — production could wire this up to a
    // Sentry / Datadog endpoint. We intentionally don't console.log
    // the entire component stack every time; it's noisy in dev and
    // leaks component names to a browser extension scraper in prod.
    console.error("StoryTime app crashed:", error.message, info.componentStack);
  }

  handleReload = () => {
    // Hard reload rather than setState back — whatever state led to
    // the crash is still there, and the user expects "reload" to mean
    // "start fresh". Also re-runs Clerk auth + data fetches.
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="error-boundary-root">
          <div className="error-boundary-card">
            <div className="error-boundary-emoji" aria-hidden="true">
              🫧
            </div>
            <h1 className="error-boundary-title">Oops — something popped</h1>
            <p className="error-boundary-body">
              The story app ran into a hiccup. Your reading progress is safe.
              Give it a reload and we'll pick up right where you left off.
            </p>
            <button
              type="button"
              className="error-boundary-button"
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
