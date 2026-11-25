"use client";

import { useState } from "react";

export function UnsubscribeButton({ token, done }: { token: string; done: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(done ? "done" : "idle");

  async function unsubscribe() {
    setState("busy");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="mt-4 text-sm font-semibold">You are unsubscribed. You will not get these emails again.</p>;
  }
  return (
    <>
      <button
        type="button"
        disabled={state === "busy"}
        onClick={unsubscribe}
        className="mt-4 rounded-lg bg-valiant px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {state === "busy" ? "Unsubscribing…" : "Unsubscribe me"}
      </button>
      {state === "error" && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">That did not work. Please try again.</p>
      )}
    </>
  );
}
