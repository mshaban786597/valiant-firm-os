"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LeadScoreInput } from "@/lib/mappers/lead";
import { AiOutputPanel } from "@/components/ai/ai-output-panel";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export function LeadActions({
  leadId,
  payload,
}: {
  leadId: string;
  payload: LeadScoreInput;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [score, setScore] = useState<unknown>(null);
  const [outreach, setOutreach] = useState<unknown>(null);

  async function postJson(url: string, label: string, body?: unknown) {
    setBusy(label);
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(await errorMessageFromResponse(res));
      return json;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={async () => {
            try {
              const json = await postJson(`/api/leads/${leadId}/score`, "score");
              setScore(json);
              toast.success("Score saved to the database.");
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Scoring failed");
            }
          }}
          className="rounded-lg bg-valiant px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy === "score" ? "Scoring…" : "Generate AI score (persist)"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={async () => {
            try {
              const json = await postJson(`/api/ai/score-lead`, "preview", payload);
              setScore(json);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Preview failed");
            }
          }}
          className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          Preview score (no DB write)
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={async () => {
            try {
              await postJson(`/api/leads/${leadId}/outreach-queue`, "queue");
              toast.success("Lead moved to outreach queue.");
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Queue update failed");
            }
          }}
          className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          Move to outreach queue
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={async () => {
            try {
              const json = await postJson(`/api/ai/generate-outreach`, "outreach", {
                lead: payload,
              });
              setOutreach(json);
              toast.success("Outreach bundle generated.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Generation failed");
            }
          }}
          className="rounded-lg border border-valiant/40 bg-valiant-soft px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {busy === "outreach" ? "Generating…" : "Generate outreach bundle"}
        </button>
      </div>

      {score ? <AiOutputPanel title="Lead score output" payload={score} /> : null}
      {outreach ? (
        <AiOutputPanel title="Outreach bundle" payload={outreach} />
      ) : null}
    </div>
  );
}
