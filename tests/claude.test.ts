import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const betaCreate = vi.fn();
const constructed: unknown[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
    constructor(status?: number, message = "api error") {
      super(message);
      this.status = status;
    }
  }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class NotFoundError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static NotFoundError = NotFoundError;
    static RateLimitError = RateLimitError;
    static APIConnectionError = APIConnectionError;
    messages = { create };
    beta = { messages: { create: betaCreate } };
    constructor(options: unknown) {
      constructed.push(options);
    }
  }
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_CLAUDE_MODEL, claudeCostUsd, claudeText, extractJson, resolveModel } from "@/lib/ai/claude";
import { LEAD_SCORE_OUTPUT_RULES } from "@/lib/ai/compute-lead-score";
import { PINGS } from "@/lib/integrations/catalog-ping";

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  model: "served-model",
  stop_reason: "end_turn",
  content: [{ type: "text", text }],
  usage: { input_tokens: 1200, output_tokens: 300 },
  ...extra,
});

beforeEach(() => {
  create.mockReset();
  betaCreate.mockReset();
  constructed.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resolveModel", () => {
  it("uses the default when nothing is configured", () => {
    expect(resolveModel(undefined)).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveModel("  ")).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it("is Claude Haiku 5.5 by default", () => {
    expect(DEFAULT_CLAUDE_MODEL).toBe("claude-haiku-5-5");
  });

  it("treats a switched-off model as not set", () => {
    expect(resolveModel("claude-sonnet-4-20250514")).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveModel("claude-opus-4-20250514")).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveModel("claude-3-haiku-20240307")).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it("ignores a value that is not a Claude model name", () => {
    expect(resolveModel("sk-ant-api03-not-a-model")).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveModel("haiku")).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it("leaves any other configured model alone", () => {
    expect(resolveModel("claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(resolveModel(" claude-sonnet-5-5 ")).toBe("claude-sonnet-5-5");
  });
});

describe("claudeText", () => {
  it("makes no call when there is no key", async () => {
    expect(await claudeText({ system: "s", user: "u", env: {} })).toBeNull();
    expect(await claudeText({ system: "s", user: "u", env: { ANTHROPIC_API_KEY: "  " } })).toBeNull();
    expect(constructed).toHaveLength(0);
  });

  it("sends a request the current models accept", async () => {
    create.mockResolvedValue(reply('{"a":1}'));
    const got = await claudeText({
      system: "sys",
      user: "usr",
      effort: "low",
      env: { ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-sonnet-4-20250514" },
    });

    expect(got).toEqual({ ok: true, text: '{"a":1}', model: "served-model", inputTokens: 1200, outputTokens: 300 });
    expect(betaCreate).not.toHaveBeenCalled();
    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "usr" }]);
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body).not.toHaveProperty("fallbacks");
    // Sampling and thinking settings are rejected by the current models.
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("thinking");
  });

  it("adds the fallback option only on a model that takes it", async () => {
    betaCreate.mockResolvedValue(reply("hello"));
    const got = await claudeText({
      system: "s",
      user: "u",
      env: { ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-sonnet-5-5" },
    });
    expect(got).toMatchObject({ ok: true, text: "hello" });
    expect(create).not.toHaveBeenCalled();
    const body = betaCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(body.output_config).toEqual({ effort: "medium" });
  });

  it("passes a JSON schema through as the reply format", async () => {
    create.mockResolvedValue(reply('{"a":1}'));
    const jsonSchema = { type: "object", properties: { a: { type: "number" } }, required: ["a"], additionalProperties: false };
    await claudeText({ system: "s", user: "u", jsonSchema, env: { ANTHROPIC_API_KEY: "k" } });
    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.output_config).toEqual({ effort: "medium", format: { type: "json_schema", schema: jsonSchema } });
  });

  it("joins text blocks and ignores thinking blocks", async () => {
    create.mockResolvedValue(
      reply("", {
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: "one " },
          { type: "text", text: "two" },
        ],
      }),
    );
    const got = await claudeText({ system: "s", user: "u", env: { ANTHROPIC_API_KEY: "k" } });
    expect(got).toMatchObject({ ok: true, text: "one two" });
  });

  it("reports a declined request instead of reading its content", async () => {
    create.mockResolvedValue(reply("partial", { stop_reason: "refusal" }));
    const got = await claudeText({ system: "s", user: "u", env: { ANTHROPIC_API_KEY: "k" } });
    expect(got).toEqual({ ok: false, model: DEFAULT_CLAUDE_MODEL, reason: "Claude declined this request" });
  });

  it("reports an empty or cut-off reply", async () => {
    create.mockResolvedValue(reply("", { content: [], stop_reason: "max_tokens" }));
    const got = await claudeText({ system: "s", user: "u", env: { ANTHROPIC_API_KEY: "k" } });
    expect(got).toMatchObject({ ok: false, reason: "Reply was cut off before any text" });
  });

  it("turns provider errors into plain reasons and never throws", async () => {
    const env = { ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-haiku-5-5" };
    const cases: [Error, string][] = [
      [new Anthropic.AuthenticationError(401 as never, undefined as never, undefined as never, undefined as never), "Anthropic rejected the API key"],
      [new Anthropic.NotFoundError(404 as never, undefined as never, undefined as never, undefined as never), 'Model "claude-haiku-5-5" was not found'],
      [new Anthropic.RateLimitError(429 as never, undefined as never, undefined as never, undefined as never), "Anthropic rate limit reached"],
      [new Error("boom"), "Claude call failed"],
    ];
    for (const [error, reason] of cases) {
      create.mockRejectedValueOnce(error);
      expect(await claudeText({ system: "s", user: "u", env })).toEqual({ ok: false, model: "claude-haiku-5-5", reason });
    }
    // The log line names the model and reason, never the key.
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("ai.claude");
    expect(logged).not.toContain('"k"');
  });
});

describe("claudeCostUsd", () => {
  it("prices a call from its real token counts", () => {
    // Haiku 5.5: $0.10 per million in, $0.50 per million out.
    expect(claudeCostUsd("claude-haiku-5-5", 1_000_000, 0)).toBeCloseTo(0.1, 10);
    expect(claudeCostUsd("claude-haiku-5-5", 1200, 300)).toBeCloseTo(0.00027, 10);
    expect(claudeCostUsd("claude-sonnet-5-5", 1000, 1000)).toBeCloseTo(0.012, 10);
    expect(claudeCostUsd("claude-opus-5-5", 1000, 1000)).toBeCloseTo(0.024, 10);
  });

  it("gives no figure for a model with no listed price", () => {
    expect(claudeCostUsd("some-future-model", 1000, 1000)).toBeUndefined();
  });
});

describe("lead scoring prompt", () => {
  it("states the same point limits the reply is checked against", () => {
    for (const line of [
      "seo_weakness_score: number from 0 to 25",
      "gbp_score: number from 0 to 20",
      "review_velocity_score: number from 0 to 20",
      "website_quality_score: number from 0 to 20",
      "business_signal_score: number from 0 to 15",
      "composite_score: number from 0 to 100",
    ]) {
      expect(LEAD_SCORE_OUTPUT_RULES).toContain(line);
    }
    expect(LEAD_SCORE_OUTPUT_RULES).toContain("Use only facts present in the lead JSON");
  });
});

describe("extractJson", () => {
  it("reads plain, fenced and wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":{"b":2}}\n```')).toEqual({ a: { b: 2 } });
    expect(extractJson('Here you go: {"a":1} Hope that helps.')).toEqual({ a: 1 });
  });

  it("returns null when there is no usable JSON", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{not json}")).toBeNull();
    expect(extractJson("}{")).toBeNull();
  });
});

describe("Claude connection test", () => {
  it("checks the model the app will call", () => {
    const stale = PINGS.anthropic!({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-sonnet-4-20250514" });
    expect(stale.url).toBe("https://api.anthropic.com/v1/models/claude-haiku-5-5");
    expect(stale.headers).toMatchObject({ "x-api-key": "k", "anthropic-version": "2023-06-01" });
    expect(PINGS.anthropic!({ ANTHROPIC_API_KEY: "k" }).url).toBe(`https://api.anthropic.com/v1/models/${DEFAULT_CLAUDE_MODEL}`);
  });
});
