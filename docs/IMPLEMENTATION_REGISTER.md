# VF Agency OS — Implementation Register

Status against the master prompt's audit gaps (G01–G10). Honest, evidence-based.
Status values: **Live-verified** (checked against the real route/DB), **Fixture-verified**
(verified with test data / mocks), **Blocked** (named prerequisite), **Pending**.

_Last updated: 2026-11-16. Repo: `valiant-agency-os` @ `main`. Deploy: https://valiant-firm-os.vercel.app (Vercel, Neon Postgres)._

| ID | Gap | Status | Evidence | Key files | Next |
|---|---|---|---|---|---|
| **G01** | Dashboard "Something went wrong" | **Live-verified (not reproducible / resolved)** | Authenticated fetch of prod `/dashboard` → HTTP 200, renders "Founder Dashboard" + MRR KPIs. `/api/health` → `ok:true, schema:true`. Server queries are null-guarded (`money()`, `?? 0`). The audit error predates earlier auth/data fixes. | `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/error.tsx` | Add dashboard empty/degraded-state regression test; extract KPI computations to a pure, tested module. |
| **G02** | Empty states, no proven persistence | **Fixture-verified / partial** | Full CRUD with audit + RBAC across leads, contacts, clients, deals, tasks, content, invoices, campaigns, ecommerce. CSV import/export for leads. 130+ unit tests. | `src/app/api/*`, `tests/*` | Playwright E2E persistence pilot (scaffold exists in `e2e/`). |
| **G03** | GSC/GBP/GA4 connection lifecycle unverified | **Blocked (provider OAuth)** | GBP/GSC/Ads modules exist with per-record sync + deterministic sample data; no live OAuth. | `src/lib/integrations/*`, `src/app/api/{gbp,gsc,google-ads}` | Real OAuth + `Integration`/connection model with status (connected/stale/needs-reauth). Needs Google credentials. |
| **G04** | Automations show no runs; outreach unproven | **Fixture-verified** | Real workflow engine: trigger→action with retry, per-run `AutomationLog` + audit + telemetry. Triggers wired: lead_created, lead_scored, contact_created, campaign_created, deal_won, webhook_received. No fabricated run history. | `src/lib/automations/*`, `src/app/api/workflows/*` | Outreach sequence runs (sending adapter) — Gmail connector now available. |
| **G05** | Deal Won → onboarding handoff unverified / not idempotent | **Fixture-verified (fixed this session)** | Added `Deal.clientId` (unique) + `completeDealWonHandoff` with atomic compare-and-set. Replay + concurrent-close tests prove exactly one client + one onboarding. | `src/lib/deal-handoff.ts`, `src/app/api/deals/[id]/route.ts`, `tests/deal-handoff.test.ts`, migration `20261116000000_deal_client_link` | Live replay via two concurrent PATCHes on staging. |
| **G06** | Long mixed sidebar; no founder control plane | **Partial** | Founder Dashboard with KPI queues + charts; shared nav (desktop + mobile) + ⌘K palette + global search. Not yet grouped into the two named workspaces. | `src/components/layout/*`, `src/app/(app)/dashboard` | Group nav into Client Operations / Sales & Outreach + Shared controls. |
| **G07** | Role enforcement / secret status unverified | **Fixture-verified** | RBAC matrix enforced server-side via `requirePermission` on every write (403 + audited). `/api/health` exposes env presence (no secret values). api-security tests (401/403, tenant isolation). | `src/lib/permissions.ts`, `src/lib/api-permission.ts`, `src/app/api/health`, `tests/{permissions,api-security}.test.ts` | Settings "Integrations health" page; role coverage report. |
| **G08** | Incident lifecycle + release verification | **Pending** | Not built. Monitoring/incident model, release manifest + post-deploy verification are the biggest missing primitive for Client Operations. | — | New `Monitor`/`Incident`/`Release` models + worker; fingerprint/dedupe; one-incident-per-failure. |
| **G09** | Ops health, budgets, retries, backups, scheduling | **Partial** | Durable automation retries + dead-letter-style failure logging; AI-spend guardrail workflow; cron endpoint (`/api/cron/generate-reports`, secret-gated); login rate-limit; fail-closed webhooks; GitHub Actions CI. | `src/lib/automations/engine.ts`, `src/lib/rate-limit.ts`, `.github/workflows/ci.yml` | Queue/worker-lag monitoring, budget notifications, backup/restore runbook. |
| **G10** | SEO/content/Ads/social/ecommerce/reports/Rank&Rent workflows | **Partial / fixture** | Modules exist: SEO (GSC/keywords/rank), content, Ads, email, reports (AI summaries), Rank & Rent, **Ecommerce** (Amazon/eBay/Etsy/Shopify + products/orders/metrics). Most run on sample data pending providers. | `src/app/(app)/*`, `src/lib/integrations/sample.ts` | Wire one real connector end-to-end (Shopify connector now available). |

## Cross-cutting

- **Multi-tenant isolation:** every operational row carries `organizationId`; every read via `requireApiOrg`, every write via `requirePermission`. Tested (`tests/api-security.test.ts`).
- **Audit:** `writeAuditLog` on every write; `/activity` feed; `/api/health` diagnostics.
- **Security finding (open):** the founder password exposed in the old recording still authenticates in production (verified `login OK`). **Rotate** via `npm run auth:reset-founder` (prints once, locally).

## Connected providers available this session (could power live pilots next)

Gmail, Google Calendar, Google Drive, **Shopify**, Hostinger (hosting/DNS/domains).
Still need auth for live audit pilots: GSC, GA4, GBP, Google Ads, Ahrefs/Semrush, Smartlead, Calendly, HubSpot, Stripe. These require `/mcp` authorization or app OAuth.

## Quality gates (run every change)

```bash
npx tsc --noEmit && npx vitest run && npm run build
```
