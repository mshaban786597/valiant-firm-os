"use client";

import { useEffect } from "react";

/**
 * Route-group error boundary for the authenticated app. Catches render/data
 * errors in any (app) page, shows a recoverable UI, and reports the error to
 * the client telemetry endpoint so failures are captured server-side.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort client-side report; never block the UI on it.
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        source: "app.error-boundary",
        message: error.message,
        digest: error.digest,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <span className="text-2xl">!</span>
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">
        Something went wrong
      </h2>
      <p className="mt-2 text-sm text-muted">
        This section hit an unexpected error. You can retry, or head back to the
        dashboard.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted">ref: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-card"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
