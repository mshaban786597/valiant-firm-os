# Valiant Firm — Agency Operating System (MVP)

Production-grade internal SaaS scaffold for Valiant Firm: revenue spine (lead → outreach → pipeline → delivery → reporting → retention) with deterministic AI fallbacks, audit-ready automation ingress, and `organization_id` on core entities for multi-tenant readiness.

Accent token in Tailwind/CSS variables aligns with `#D30404`.

---

## 1) Repository layout (high level)

```
valiant-agency-os/
├─ prisma/
│  ├─ schema.prisma                # Full Postgres schema (UUID IDs + FKs + indexes)
│  ├─ migrations/…/migration.sql   # Initial SQL migration (run via Prisma)
│  ├─ seed.ts                      # Realistic demo dataset (10 leads / 5 clients / …)
│  └─ supabase-rls.sql             # Optional Supabase RLS notes/patterns
├─ src/
│  ├─ app/
│  │  ├─ (app)/                    # Authenticated route group (all OS modules)
│  │  ├─ api/                      # Next route handlers (REST + AI + webhook)
│  │  ├─ login/                    # Auth UI (+ Suspense wrapper)
│  │  ├─ layout.tsx / globals.css
│  │  └─ middleware.ts             # JWT cookie gate + route protection
│  ├─ components/                  # Shell + KPI cards + charts + boards + AI panels
│  └─ lib/                         # Prisma, auth, audits, AI engines, schemas
└─ .env.example
```

---

## 2) Database schema & migrations

- **Authoritative schema:** `prisma/schema.prisma`
- **SQL migration:** `prisma/migrations/20260510160000_init/migration.sql`
- **Indexes:** `status`, `organization_id`, `client_id`, `lead_score`, `city`, `niche`, timestamps across operational tables.
- **Multi-tenant prep:** every operational row carries `organizationId`; optional Supabase RLS hooks documented in `prisma/supabase-rls.sql`.
- **Auth-related tables:** `User`, `Account`, `Session`, `VerificationToken` (NextAuth Prisma adapter) plus `Role` + `OrganizationMember`.

Apply migrations:

```bash
npm run db:migrate
```

During early prototyping you may prefer:

```bash
npm run db:push
```

---

## 3) Seed data

```bash
npm run db:seed
```

Defaults (override via env):

- `SEED_ADMIN_EMAIL` → defaults to `founder@valiantfirm.agency`
- `SEED_ADMIN_PASSWORD` → defaults to `ValiantDemo!2026`

Seed bootstraps org slug **`valiant-firm`** plus Founder membership tied to `Role.key = FOUNDER`.

---

## 4) AI endpoints & deterministic engines

| Route | Purpose |
| --- | --- |
| `POST /api/ai/score-lead` | Strict JSON scoring w/ OpenAI→Anthropic→rules fallback |
| `POST /api/ai/generate-outreach` | Multi-touch outreach bundle |
| `POST /api/ai/generate-proposal` | Structured proposal JSON sections |
| `POST /api/ai/content-brief` | SERP/AEO/GEO-aware brief JSON |
| `POST /api/ai/generate-report-summary` | Monthly narrative blocks |
| `POST /api/ai/health-risk-summary` | Health scoring + retention automations |

Engines live under:

- Prompt shells → `src/lib/ai/prompts.ts`
- LLM orchestration → `src/lib/ai/llm-json.ts`
- Rule fallback scoring → `src/lib/ai/rule-score.ts`
- Rule fallback copy bundles → `src/lib/ai/fallbacks.ts`
- Persisted scoring helper → `src/lib/ai/compute-lead-score.ts`

Structured schemas → `src/lib/schemas/*.ts` (+ composite inputs in `src/lib/schemas/inputs.ts`).

Every AI response path writes immutable telemetry via `AiLog` through `src/lib/ai/log.ts`.

---

## 5) Automation webhook ingress

Endpoint: `POST /api/webhooks/automation`

- Optional **HMAC** verification (`WEBHOOK_SECRET`) via header `x-webhook-signature: sha256=<hex>` (`src/lib/webhooks.ts`).
- Sample payload documented inline inside route handler (`src/app/api/webhooks/automation/route.ts`).

Example curl:

```bash
curl -X POST "%NEXTAUTH_URL%/api/webhooks/automation" ^
  -H "Content-Type: application/json" ^
  -H "x-webhook-signature: sha256=<hmac_hex>" ^
  -d "{\"organizationSlug\":\"valiant-firm\",\"automationName\":\"Monthly SEO Data Pull\",\"status\":\"success\",\"connectedTools\":[\"GA4\",\"GSC\"]}"
```

---

## 6) Core REST endpoints

| Area | Routes |
| --- | --- |
| Leads | `GET/POST /api/leads`, `GET/PATCH/DELETE /api/leads/[id]`, `POST /api/leads/[id]/score`, `POST /api/leads/[id]/outreach-queue` |
| Deals | `PATCH /api/deals/[id]` *(closes spawn onboarding checklist)* |
| Clients | `GET/POST /api/clients`, `GET/PATCH /api/clients/[id]` |
| Tasks | `GET/POST /api/tasks`, `PATCH /api/tasks/[id]` |
| Onboarding | `PATCH /api/onboarding-items/[id]` |

All authenticated APIs rely on NextAuth session + default membership (`requireApiOrg`).

Audit hooks → `src/lib/audit.ts`.

---

## 7) UI surfaces

Sidebar/top navigation mirrors `/dashboard`, `/leads`, `/outreach`, `/pipeline`, `/clients`, `/delivery`, `/content`, `/reports`, `/health`, `/automations`, `/ai-logs`, `/rank-rent`, `/saas-roadmap`, `/settings`.

Key primitives:

- `src/components/layout/*` shell chrome & theme toggle (`next-themes`)
- `src/components/charts/dashboard-charts.tsx` founder KPI visuals (`recharts`)
- Boards → pipeline (`DealStage`), tasks (`TaskStatus`)

---

## 8) Local setup (Windows/macOS/Linux)

1. **Clone/open** `valiant-agency-os`.
2. Copy `.env.example` → `.env` and fill `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
3. Install deps (already handled via npm):

```bash
npm install
```

4. Migrate + seed:

```bash
npm run db:migrate
npm run db:seed
```

5. Dev server:

```bash
npm run dev
```

Visit `/login`, authenticate with seeded Founder credentials, then `/dashboard`.

---

## 9) Deployment blueprint

**Suggested baseline:**

1. Create Supabase Postgres + paste connection string into `DATABASE_URL`.
2. Run `npm run db:migrate` & `npm run db:seed` from CI/CD or Supabase SQL console equivalents.
3. Deploy Next.js to **Vercel** (`NEXTAUTH_URL` must equal canonical HTTPS URL).
4. Store secrets (`NEXTAUTH_SECRET`, AI keys, `WEBHOOK_SECRET`) as encrypted env vars.
5. Optionally migrate auth from Credentials-only → Supabase Auth or Clerk by swapping `authOptions` + middleware token resolver without rewriting modules.

---

## 10) Hardening checklist

- [ ] Flip middleware/token secrets per environment (no shared demo secrets).
- [ ] Enable Supabase RLS + map JWT claims → `organizationId`.
- [ ] Wire Stripe webhooks → client onboarding automation logs.
- [ ] Attach observability (OpenTelemetry/Sentry) on AI routes + webhook ingress.

---

Built as **Phase 1–3 MVP parity**: dashboard/leads/scoring/clients/outreach/pipeline/proposals/tasks/onboarding/reports/health/automation & AI telemetry/rank-rent/SaaS roadmap/settings—all runnable behind JWT sessions today.
