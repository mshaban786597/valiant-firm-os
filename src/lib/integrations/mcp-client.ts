/**
 * Minimal MCP client over Streamable HTTP: initialize, then call tools.
 * Handles both plain JSON and event-stream replies. Server only.
 */
type FetchLike = typeof fetch;

export type McpError = "unauthorized" | "rate_limited" | "tool_error" | "protocol" | "unreachable";
export type McpResult<T> = { ok: true; data: T } | { ok: false; error: McpError; detail: string };

const PROTOCOL_VERSION = "2025-06-18";

/** Pull the JSON-RPC message out of a reply that is either JSON or "data: {...}" lines. */
export function parseRpcReply(contentType: string | null, text: string): { result?: unknown; error?: { message?: string } } | null {
  try {
    if ((contentType ?? "").indexOf("text/event-stream") !== -1) {
      const lines = text.split(/\r?\n/).filter((l) => l.indexOf("data:") === 0);
      for (let i = lines.length - 1; i >= 0; i--) {
        const msg = JSON.parse(lines[i]!.slice(5).trim()) as { result?: unknown; error?: { message?: string }; id?: unknown };
        if (msg.result !== undefined || msg.error !== undefined) return msg;
      }
      return null;
    }
    return text ? (JSON.parse(text) as { result?: unknown; error?: { message?: string } }) : null;
  } catch {
    return null;
  }
}

/** A tool result's text content parsed as JSON (MCP tools return JSON as text). */
export function parseToolResult(result: unknown): McpResult<unknown> {
  const r = (result ?? {}) as { isError?: boolean; structuredContent?: unknown; content?: { type?: string; text?: string }[] };
  const text = (r.content ?? []).filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text!).join("\n");
  if (r.isError) return { ok: false, error: "tool_error", detail: text.slice(0, 300) || "The tool reported an error" };
  if (r.structuredContent !== undefined && r.structuredContent !== null) return { ok: true, data: r.structuredContent };
  if (!text) return { ok: false, error: "protocol", detail: "The tool returned no content" };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: true, data: text };
  }
}

export class McpSession {
  private sessionId: string | null = null;
  private nextId = 1;
  private ready = false;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async send(method: string, params: unknown, notification = false): Promise<McpResult<unknown>> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": PROTOCOL_VERSION,
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        },
        body: JSON.stringify(notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: this.nextId++, method, params }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      return { ok: false, error: "unreachable", detail: "No response from the MCP server" };
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (res.status === 401 || res.status === 403) return { ok: false, error: "unauthorized", detail: `HTTP ${res.status}` };
    if (res.status === 429) return { ok: false, error: "rate_limited", detail: "HTTP 429" };
    const text = await res.text();
    if (!res.ok) return { ok: false, error: "protocol", detail: `HTTP ${res.status}` };
    if (notification) return { ok: true, data: null };
    const msg = parseRpcReply(res.headers.get("content-type"), text);
    if (!msg) return { ok: false, error: "protocol", detail: "The reply could not be read" };
    if (msg.error) return { ok: false, error: "tool_error", detail: (msg.error.message ?? "Request failed").slice(0, 300) };
    return { ok: true, data: msg.result };
  }

  private async init(): Promise<McpResult<true>> {
    if (this.ready) return { ok: true, data: true };
    const r = await this.send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "valiant-agency-os", version: "1.0" },
    });
    if (!r.ok) return r;
    await this.send("notifications/initialized", {}, true);
    this.ready = true;
    return { ok: true, data: true };
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpResult<unknown>> {
    const ready = await this.init();
    if (!ready.ok) return ready;
    const r = await this.send("tools/call", { name, arguments: args });
    return r.ok ? parseToolResult(r.data) : r;
  }
}
