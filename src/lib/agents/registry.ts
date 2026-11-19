/**
 * Agent registry. One dispatch owner (the Agency OS workflow engine) routes
 * work; each agent declares its role, contract, permissions, budget and the
 * existing worker that serves the capability when its named runtime is not
 * connected. Runtime status is derived from the environment, never assumed.
 */
type Env = Record<string, string | undefined>;

export const DISPATCH_OWNER = "Agency OS workflow engine (src/lib/automations/engine.ts)";

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  /** Env var that points at the agent's own runtime, when one exists. */
  runtimeEnv: string | null;
  input: string;
  output: string;
  evidence: string;
  permissions: string[];
  tools: string[];
  /** Budget guardrail, in plain words. */
  budget: string;
  /** The existing in-app worker that serves this capability today. */
  fallbackWorker: string;
  /** agentName values this agent writes to the AI log. */
  logNames: string[];
}

export const AGENTS: AgentDefinition[] = [
  {
    id: "openclaw",
    name: "OpenClaw",
    role: "Monitoring and analysis",
    runtimeEnv: "OPENCLAW_URL",
    input: "Site + environment + check type",
    output: "Check result (pass / fail / not measured) with detail",
    evidence: "MonitorCheck rows, incident timeline",
    permissions: ["monitor.read", "monitor.write", "incident.write"],
    tools: ["HTTP probe", "DNS", "PageSpeed Insights"],
    budget: "No model cost; bounded by check cadence (max 80 checks per scheduler tick)",
    fallbackWorker: "Site monitor (src/lib/monitoring/runner.ts + incidents.ts)",
    logNames: [],
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    role: "Research and strategy",
    runtimeEnv: "HERMES_AGENT_URL",
    input: "Lead or client record",
    output: "Score, recommended offer, outreach angle",
    evidence: "LeadScore rows, LeadEvidence rows",
    permissions: ["lead.read", "lead.write"],
    tools: ["Lead scoring model", "rank / keyword providers when connected"],
    budget: "Per-call model cost recorded in AI logs; deterministic fallback costs nothing",
    fallbackWorker: "Lead scoring (src/lib/ai/compute-lead-score.ts, rule-based fallback)",
    logNames: ["lead-score", "lead_scoring"],
  },
  {
    id: "claude",
    name: "Claude",
    role: "Reasoning and content",
    runtimeEnv: "ANTHROPIC_API_KEY",
    input: "Structured prompt (src/lib/ai/prompts.ts)",
    output: "Schema-validated JSON (src/lib/schemas)",
    evidence: "AI log entry per call (tokens, cost, status)",
    permissions: ["report.write", "lead.write"],
    tools: ["Anthropic API (after OpenAI in the model chain)"],
    budget: "30-day AI spend shown on the Dashboard; spend-guardrail workflow available",
    fallbackWorker: "Deterministic fallbacks (src/lib/ai/fallbacks.ts)",
    logNames: ["report-summary", "health-risk", "outreach"],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    role: "Scoped fixes and verification",
    runtimeEnv: null,
    input: "Approved change proposal (site, environment, artifact version, files in scope)",
    output: "Staged patch + test results; execution and verification recorded on the proposal",
    evidence: "Approval record, audit log (change.*), re-run of the original check",
    permissions: ["approval.request", "approval.decide (human only)"],
    tools: ["Isolated git branch", "repo test commands"],
    budget: "Runs only on an approved, unexpired proposal",
    fallbackWorker: "Operator-run session; nothing executes inside the app without approval",
    logNames: [],
  },
  {
    id: "atomic",
    name: "Atomic Agent",
    role: "Automation and operations",
    runtimeEnv: "ATOMIC_AGENT_URL",
    input: "Trigger event (lead created, deal won, webhook, schedule)",
    output: "Workflow run with per-step result",
    evidence: "AutomationLog rows, audit log",
    permissions: ["automation.read", "automation.write"],
    tools: ["Workflow engine", "scheduler", "webhook hub"],
    budget: "Retries capped per step; failures logged, never silently dropped",
    fallbackWorker: "Workflow engine (src/lib/automations/engine.ts)",
    logNames: [],
  },
];

export interface AgentStatus {
  runtimeConnected: boolean;
  /** Plain statement of what is serving this capability right now. */
  servedBy: string;
}

export function agentStatus(agent: AgentDefinition, env: Env = process.env): AgentStatus {
  const connected = !!agent.runtimeEnv && !!env[agent.runtimeEnv] && env[agent.runtimeEnv]!.trim() !== "";
  return {
    runtimeConnected: connected,
    servedBy: connected ? `${agent.name} runtime` : agent.fallbackWorker,
  };
}
