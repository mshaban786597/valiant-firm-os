"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// Map NextAuth error codes to safe, user-facing copy (never leak internals).
function messageForError(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "Configuration":
    case "ServiceUnavailable":
      return "Sign-in is temporarily unavailable. Please try again shortly.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Pick up an error passed back via redirect (e.g. Configuration errors).
  const [error, setError] = useState<string | null>(() =>
    messageForError(params.get("error")),
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
      callbackUrl,
    });
    setLoading(false);
    if (res?.error) {
      setError(messageForError(res.error) ?? "Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-card-border bg-card p-8 shadow-shell dark:shadow-shell-dark">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-valiant shadow-[0_0_30px_rgba(211,4,4,0.35)]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Valiant Firm
            </div>
            <div className="text-xl font-semibold tracking-tight">
              Agency OS · Login
            </div>
          </div>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Email
            </label>
            <input
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none ring-valiant/30 focus:ring-2"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Password
            </label>
            <input
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none ring-valiant/30 focus:ring-2"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? (
            <div className="rounded-lg border border-valiant/40 bg-valiant-soft px-3 py-2 text-xs text-valiant">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-lg bg-valiant py-2.5 text-sm font-semibold text-white shadow-[0_18px_60px_rgba(211,4,4,0.35)] disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Enter command center"}
          </button>
        </form>
        <p className="mt-6 text-xs text-muted">
          Authorized Valiant Firm team members only.
        </p>
      </div>
    </div>
  );
}
