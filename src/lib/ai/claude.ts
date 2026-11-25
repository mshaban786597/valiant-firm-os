import Anthropic from "@anthropic-ai/sdk";

/**
 * The one place the app talks to Claude. Server only.
 *
 * Returns `null` when no key is configured (the caller then uses its
 * rule-based fallback), `{ ok: false }` with a plain reason when a call was
 * made and failed, and `{ ok: true }` with the reply text otherwise.
 */

type Env = Record<string, string | undefined>;

/** Used when ANTHROPIC_MODEL is not set. */
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";

/**
 * Models Anthropic has switched off (requests to them return 404). An old
 * ANTHROPIC_MODEL value naming one of these is treated as not set, so it
 * cannot silently turn every AI feature off.
 */
const RETIRED_MODELS = new Set([
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-opus-4-20250514",
  "claude-opus-4-1-20250805",
  "claude-3-haiku-20240307",
]);

/** Models that can hand a declined request to another model on Anthropic's side. */
const SERVER_FALLBACK_MODELS = new Set([
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

/** The model the app will actually call for a given ANTHROPIC_MODEL value. */
export function resolveModel(configured: string | undefined): string {
  const id = (configured ?? "").trim();
  // Anything that is not a Claude model name (for example a key pasted into
  // the wrong box) is ignored, so it is never sent or logged as a model.
  if (!id.startsWith("claude-") || RETIRED_MODELS.has(id)) return DEFAULT_CLAUDE_MODEL;
  return id;
}

/** How hard the model works on a request: lower is quicker and cheaper. */
export type ClaudeEffort = "low" | "medium" | "high";

export type ClaudeResult =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; model: string; reason: string };

/** Published price in US dollars per million tokens: [input, output]. */
const PRICE_PER_MILLION: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};

/** Cost of one call from its real token counts; undefined for a model with no listed price. */
export function claudeCostUsd(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const price = PRICE_PER_MILLION[model];
  if (!price) return undefined;
  return (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000;
}

function failureReason(err: unknown, model: string): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic rejected the API key";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key is not allowed to use that model";
  if (err instanceof Anthropic.NotFoundError) return `Model "${model}" was not found`;
  if (err instanceof Anthropic.RateLimitError) return "Anthropic rate limit reached";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach Anthropic";
  if (err instanceof Anthropic.APIError) return `Anthropic returned HTTP ${err.status ?? "error"}`;
  return "Claude call failed";
}

function fail(model: string, reason: string): ClaudeResult {
  // One JSON line, no prompt text and no key: enough to see why AI output is missing.
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", source: "ai.claude", model, message: reason }));
  return { ok: false, model, reason };
}

export async function claudeText(opts: {
  system: string;
  user: string;
  effort?: ClaudeEffort;
  /**
   * JSON schema the reply must follow. With it the provider only produces
   * valid JSON of that shape, so a reply cannot arrive malformed.
   */
  jsonSchema?: Record<string, unknown>;
  env?: Env;
}): Promise<ClaudeResult | null> {
  const env = opts.env ?? process.env;
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model = resolveModel(env.ANTHROPIC_MODEL);
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  const request = {
    model,
    max_tokens: 16000,
    system: opts.system,
    messages: [{ role: "user" as const, content: opts.user }],
    output_config: {
      effort: opts.effort ?? "medium",
      ...(opts.jsonSchema ? { format: { type: "json_schema" as const, schema: opts.jsonSchema } } : {}),
    },
  };

  try {
    const message = SERVER_FALLBACK_MODELS.has(model)
      ? await client.beta.messages.create({
          ...request,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        })
      : await client.messages.create(request);

    if (message.stop_reason === "refusal") return fail(model, "Claude declined this request");

    let text = "";
    for (const block of message.content) {
      if (block.type === "text") text += block.text;
    }
    if (!text.trim()) {
      return fail(model, message.stop_reason === "max_tokens" ? "Reply was cut off before any text" : "Claude returned no text");
    }
    return {
      ok: true,
      text,
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  } catch (err) {
    return fail(model, failureReason(err, model));
  }
}

/** Pulls the JSON object out of a reply (tolerates code fences and stray text). */
export function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}
