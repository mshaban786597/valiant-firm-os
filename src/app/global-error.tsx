"use client";

/**
 * Root global error boundary. Only renders when the root layout itself throws,
 * so it must supply its own <html>/<body>. Kept dependency-free and inline-
 * styled because app providers/styles may not have mounted.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b0b0c",
          color: "#f5f5f5",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Application error</h1>
          <p style={{ fontSize: 14, opacity: 0.75, marginTop: 8 }}>
            The app failed to load. Please retry.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
              ref: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              background: "#D30404",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
