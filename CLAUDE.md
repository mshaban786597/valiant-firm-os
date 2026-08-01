# CLAUDE.md — Valiant Firm Agency OS

Architecture, conventions, and commands for future sessions. Read this first.

## Stack
Next.js 14.2 (App Router) · TypeScript (strict) · Prisma 5.22 (Postgres) ·
NextAuth v4 (Credentials + JWT) · Zod 4 · Tailwind · Recharts · Vitest ·
Playwright (E2E). API routes run on the **Node.js runtime** (Prisma/bcrypt).

## Layout
- `src/app/(app)/*` — authenticated pages (server components fetch via Prisma).
- `src/app/api/*` — route handlers. `src/app/login`, `src/app/portal/[token]` public.
- `src/lib/*` — shared logic. Key modules:
  - `auth.ts` / `auth-secret.ts` / `env.ts` — NextAuth config, secret, env status.
  - `api-org.ts` (`requireApiOrg`) + `api-permission.ts` (`requirePermission`).
  - `permissions.ts` — RBAC matrix (`can(role, action)`); `status.ts` — lifecycle
    state machines; `deals.ts`, `money.ts` — pure domain math.
  - `rate-limit.ts` — DB-backed login throttle; `webhooks.ts` — HMAC verify.
  - `automations/*` — workflow engine; `integrations/registry.ts` + `sample.ts`.
  - `audit.ts`, `telemetry.ts`, `api-logger.ts` — audit + observability.
- `src/lib/schemas/*` — Zod input/output schemas. `src/components/ui/*` — shared UI.
- `prisma/schema.prisma` — 36 models. `prisma/seed.ts` (system-only, production-safe),
  `prisma/seed-demo.ts` (dev sample data). `tests/*` — vitest. `e2e/*` — Playwright.
  `scripts/*` — data + auth ops.

## Non-negotiable conventions
- **Multi-tenant:** every operational row has `organizationId`; every query filters
  by it. Reads → `requireApiOrg`; writes → `requirePermission("<action>")` (403 +
  audited on denial). Never trust org/role from the request body.
- **Audit every write** via `writeAuditLog`. **Validate every input** with Zod.
- **AI:** prompts in `ai/prompts.ts`, schemas in `schemas/`, chain in `ai/llm-json.ts`
  (OpenAI → Anthropic → deterministic fallback in `ai/fallbacks.ts`). Works with no keys.
- **External calls fail safe:** integrations/email/webhooks gate on env; empty env
  var = "not configured" (never crash). Webhooks are **fail-closed** (reject when the
  signing secret is unset unless `ALLOW_UNVERIFIED_WEBHOOKS=true`).
- **No secrets in code.** New keys via `process.env`, documented in `.env.example`.
- **UI:** reuse `src/components/ui/*` (`data-table`, `status-badge`, `empty-state`,
  `modal`), accent `#D30404`, Tailwind tokens. Truthful zero states — never fabricate
  metrics (no `Math.random`, no hardcoded dashboard numbers).

## Quality gates (must pass every phase)
```bash
npx tsc --noEmit      # strict typecheck
npx vitest run        # unit tests (add tests for every new feature)
npm run build         # production build
```

## Commands
```bash
npm run dev                          # local dev server
npm run db:seed                      # system config only (safe for prod)
npm run db:seed:demo                 # full dev sample data
npx prisma migrate deploy            # apply migrations (DB must be reachable)
npm run data:audit-demo              # dry-run report of demo rows
npm run data:clean-demo -- --confirm # back up + remove demo rows (transactional)
npm run auth:reset-founder           # rotate founder password (prints once, local)
npm run test:e2e                     # Playwright (needs: playwright install + dev server)
```

## Env (see .env.example)
Required for auth: `DATABASE_URL`, `NEXTAUTH_SECRET` (or `AUTH_SECRET`), `NEXTAUTH_URL`.
Optional (empty = feature off): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`,
`WEBHOOK_SECRET*`, `CRON_SECRET`, `ALLOW_OUTBOUND_WEBHOOKS`, `ALLOW_UNVERIFIED_WEBHOOKS`.
Health check: `GET /api/health` reports server/db/schema/authConfigured (no secret values).

## Adding a feature (checklist)
1. Prisma model (+ `organizationId`, indexes on org/client/status/date) → migration.
2. Zod schema in `src/lib/schemas/`. 3. API route: `requirePermission` → validate →
mutate → `writeAuditLog`. 4. Server page + client workspace reusing `ui/*`.
5. Add to sidebar nav + `middleware.ts` protected prefixes + `permissions.ts` actions.
6. Unit tests in `tests/`. 7. Run all three gates.
