# VF Agency OS — 78 → production: implementation register

Branch `production-readiness`. Statuses used here, and nowhere mixed:

- **Live verified** — observed against the real site / provider / database in the live scope
- **Fixture verified** — proven with labeled test data, the test sender, or a mocked provider
- **Implemented, verification pending** — code is in place; not yet exercised end to end
- **Blocked** — cannot proceed without the named prerequisite
- **Pending** — not started

No scores. Every row points at a test, a command or a record.

## Verification commands (last results)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 211 tests, 23 files, all pass |
| `npm run build` | compiled successfully |
| `npm run pilots` | 32 of 32 checks passed (demo scope, real database) |
| `npm run site:add -- https://bigbendgutters.com "Big Bend Gutters" --routes` | 14 live checks created and run |
| `npm run release:verify -- https://bigbendgutters.com https://www.bigbendgutters.com / /contact/ /services/gutter-repair/` | expected 30 · checked 30 · failed 0 · skipped 0 |

On Git Bash prefix path arguments with `MSYS_NO_PATHCONV=1`, otherwise `/contact/` is rewritten to a Windows path.

## Phase 1 — Dashboard, data accuracy, monitoring

| Item | Was | Now | Status | Evidence |
|---|---|---|---|---|
| Monitoring mismatch | "Uptime (last check) 90%" was 9 passing ÷ 10 checks with any status; the 10th was an unmeasured page-speed check. Shown next to "All monitored checks are healthy". | One shared definition (`src/lib/monitoring/state.ts`): passing / failing / unmeasured / stale / never run / disabled. Pass rate = passing ÷ measured, with denominators. | Live verified | Reproduced from the live DB before the change; after: Monitoring page shows "100% · 8 of 8 measured checks passed · 1 not measured". `tests/monitoring-state.test.ts` reproduces the walkthrough data. |
| Uptime | Not uptime at all | Computed only from uptime observations in a named 24h window; "Unavailable" below 4 observations | Live verified | Page shows "Unavailable · 3 uptime observations in the last 24h; 4 needed" |
| Empty-state copy | Hard-coded "All monitored checks are healthy" | Derived from records (`noIncidentsCopy`) | Live verified | "8 of 9 eligible checks are passing and fresh; 1 could not be measured." |
| Client Health alert | Critical pilot alert shown as current although its incident had resolved | Alerts link to their incident and move to history on recovery; original timestamps kept | Fixture verified | Pilot: active alerts 1 → 0, history 1 |
| Pages agree | Monitoring, Client Health, Delivery used different queries | All read `getMonitoringSummary` (`ReconcileStrip`), with scope and window stated | Fixture verified | Pilot: 1 / 1 / 1 while open, 0 / 0 / 0 after recovery, 1 task awaiting closure |
| Demo scope | Pilot data counted in live KPIs ($1,500 MRR) | `isDemo` on operational records; Live/Demo switch; live totals, exports, search, alerts exclude fixtures | Live verified | Dashboard (live): Contracted MRR $0, "4 pilot fixture records are kept in the demo scope". Pilot: live $0 / demo $1,500 |
| Revenue metrics | "Net MRR change" used an invented 0.25 weighting | Contracted MRR, Invoiced (30d), Collected (30d) as separate sourced metrics | Fixture verified | `computeDashboardKpis` tests |
| Dashboard states | — | Empty, populated and degraded (`settle`) states; links to incidents, tasks, reviews, meetings, provider connections | Live verified (empty), Fixture verified (populated, degraded) | Live dashboard renders with no live records; unit tests |
| Incident lifecycle | Any failure opened an incident; re-runs added occurrences | Confirmation threshold, retry vs fresh observation, maintenance window, unique open incident per fingerprint (DB index) | Fixture verified | `tests/monitoring.test.ts` (11 cases) + pilot |
| Run feedback | "Check recorded: none" | Outcome, time and next action | Live verified | "Passed at 19:58 UTC. HTTP 307 in 1422ms. No action needed." / "Could not be measured at 19:58 UTC. PageSpeed API unavailable (HTTP 429)…" |
| Simulation controls | Available on every check | Only on demo-scope checks | Live verified | Forced failure on the live "Big Bend Gutters — Uptime" check was refused with HTTP 403 |

Exit evidence, by state: healthy and unmeasured are live (app's own site and bigbendgutters.com); failed and recovered are fixture (pilot lead route), plus one live failing check (see Phase 2).

## Phase 2 — One site, one GSC property, one alert channel

| Item | Status | Evidence / prerequisite |
|---|---|---|
| Site checks for bigbendgutters.com | **Live verified** | 14 checks (9 site-wide + 5 critical pages: /contact/, /about/, /services/, /services/gutter-installation…, /services/gutter-repair…). 12 passing, 1 failing, 1 unmeasured. Expected vs actual printed by `site:add`. |
| Live finding | **Live verified** | Security headers: expected HTTPS + core headers, actual "Missing HSTS; Missing X-Frame-Options". One WARNING incident is open in the live scope. No task, because the check is not linked to a client record. |
| Page speed / Core Web Vitals | **Blocked** | Keyless PageSpeed API returns HTTP 429. Needs `PAGESPEED_API_KEY` (free Google Cloud key). Owner: account holder. |
| Form submission check | **Pending** | No designated test route or test destination on the site; synthetic submissions are not sent to the real form. |
| GSC adapter | **Fixture verified** | `gsc.ts`, `gsc-sync.ts`, `google-auth.ts`: test access against the exact property id, paginated sync, per-period metrics with safe replay, aggregate CTR, error states that keep known data. Tests cover pagination, quota, wrong property, missing credential. UI: Test access / Sync / Disconnect on SEO page. |
| GSC sync for Big Bend Gutters | **Blocked** | Needs (1) `GOOGLE_SERVICE_ACCOUNT_JSON` — a Google Cloud service-account key with the Search Console API enabled; (2) that service account added as a user on the property; (3) the exact property identifier (`sc-domain:bigbendgutters.com` or the URL-prefix form) and a client record to map it to. Owner: whoever owns the BBG Search Console property. Reconciliation against the GSC UI can only happen after that. |
| Alert channel | **Blocked** (adapters Fixture verified) | 0 of 3 channels configured. Email to the test inbox needs `RESEND_API_KEY` + `ALERT_EMAIL_TO=muhammad@valiantfirm.com` (Slack: `SLACK_WEBHOOK_URL`; Telegram: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`). Adapters tested with a mocked provider, including provider reference capture. States shown: not attempted / accepted by provider / failed. |
| Integration count | **Live verified** | 1 of 32 connected: Website Monitor (built in). Nothing else has credentials. |

## Phase 3 — Client Operations: failure → report (fixture, demo scope)

Run with `npm run pilots`. Staging fixture `staging.pcgutters.example`, broken lead route.

1. First failure unconfirmed; second opens incident + one task (owner, priority, evidence).
2. Repeat trigger: no duplicate incident or task; a retry is not counted as an occurrence.
3. Scoped change proposal (site, environment, artifact version, expected behavior, test results, rollback path, files in scope).
4. Enforcement: execution refused while unapproved, when rejected, and when the approval has expired. Valid approval executes; rollback exercised; fix re-applied; original check re-run → incident resolved.
5. Execution, verification and closure tracked separately (executed / passed / task in QA).
6. Report built from persisted observations; client-ready refused while work is outstanding and for an outdated version; latest version released.
7. Deployment check: baseline vs staging manifest, expected / checked / failed / skipped, Robots declared as an environment difference; a broken candidate fails on H1 and form routing.

Status: **Fixture verified**. The patch itself is simulated by a fixture worker: no real code was changed on any site. Running Claude Code against a real client repository on an isolated branch is **Pending** (needs a named repository and environment).

## Phase 4 — Sales & Outreach: prospect → onboarding (fixture, demo scope)

Test contact: `muhammad@valiantfirm.com` (plus-addresses for the opt-out and decline cases). Test sender and test calendar only.

1. Prospect with 5 evidence rows; organic and Maps observations separate; dedup keeps branches.
2. Scored, drafted, approved once.
3. First email confirmed by the sender with message and thread ids; follow-ups at +4 and +5 business days in the same thread; replay sends nothing twice.
4. Worker restart mid-send: reconciled with the same idempotency key, sent exactly once.
5. Replies labeled; positive reply, opt-out and decline each cancel pending follow-ups; opt-out is suppressed and nothing sends later.
6. Meeting recorded from the calendar event id; confirm → reschedule → attended stays one meeting.
7. Three concurrent Closed Won events → one client, 26 onboarding items, one baseline audit task carrying evidence and meeting summary; replay creates nothing.
8. Metrics: demo and live shown separately; opens not counted.

Status: **Fixture verified**. No real email was sent to anyone.

**Real outreach email is off by default.** It needs `RESEND_API_KEY`, `OUTREACH_LIVE_SENDING="true"`, and the recipient listed in `OUTREACH_ALLOWED_RECIPIENTS`. With the list empty, no real address can be emailed. Live send, reply ingestion from a mailbox, and calendar webhooks are **Blocked** on those credentials.

## Phase 5 — Provider / capability matrix

| Capability | Status | Note |
|---|---|---|
| Website monitor (uptime, DNS, TLS, indexing, content, links, security, mobile, pages) | Live verified | 2 sites, 23 live checks |
| PageSpeed / Core Web Vitals | Blocked | `PAGESPEED_API_KEY` |
| Scheduled checks every 15 min | Blocked | `CRON_SECRET` in Vercel + GitHub secrets `APP_URL`, `CRON_SECRET` |
| Search Console | Fixture verified; live Blocked | service account + property access |
| GA4, GBP | Sample data only; live Pending | modules exist; no live adapter yet |
| Google Ads | Live adapter, read only (service account) | Explorer access approved; the only linked account (Valiant Firm, 302-610-1423) is cancelled, so Google returns no data yet |
| Meta Ads, Mailchimp, Calendly, Stripe, Shopify, Anthropic, Telegram, Resend | Implemented, verification pending | connection test built; no credentials to run it |
| TikTok Ads, Amazon, eBay, Etsy | Pending | credential slot only |
| Ubersuggest | Imported | No API key. Data is pulled through the Ubersuggest connector in Claude and stored as dated snapshots. Ahrefs, Semrush and Moz were removed on 2026-11-23: not used. |
| Email / Slack / Telegram alerts | Fixture verified; live Blocked | no channel configured |
| Outreach sending | Fixture verified; live Blocked | off by default (see Phase 4) |
| Email campaigns module | Sample data | "Send" is simulated and shows sample engagement; it does not send email |
| Agents | Implemented | Registry (`src/lib/agents/registry.ts`) with role, contract, permissions, budget, fallback. OpenClaw, Hermes and Atomic runtimes are not connected; their capabilities are served by the built-in workers named on the Automation System page. |
| Integration test history | Implemented, verification pending | results stored per integration; "Live verified" only after a real provider call succeeds |

## Phase 6 — Staging and handoff

| Item | Status | Note |
|---|---|---|
| Typecheck, tests, build | Passed | see commands above |
| Local click-through | Live verified | Signed in on a local server (port 3001). Live scope: Dashboard, Monitoring, run-check feedback, Integrations, Automation System. Demo scope: Client Health, Review & Approvals, Outreach, Reports. The Live/Demo button itself was not clicked (the browser pane was hidden); the scope was switched by setting the same cookie the button sets. |
| Worker restart safety | Fixture verified | pilot step 4 |
| Vercel preview / staging | Blocked | Preview environment has no `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`; the Vercel CLI hangs in this shell, so they could not be set |
| Backup / restore | Pending | Not exercised. Neon point-in-time restore or a branch is the path; owner: database account holder |
| Lint | Not run | `next lint` is not part of CI in this repo |

**Database.** Migration `20261117000000_production_readiness` is applied. It is additive (new columns with defaults, new tables, one partial unique index), so the currently deployed code keeps working against it.

**Production deploy path.** Merge the pull request into `main`; Vercel builds and deploys automatically. Post-release checks: `/api/health` returns ok; sign in; Dashboard, Monitoring and Review & Approvals load.

**Rollback.** In Vercel, promote the previous production deployment (or `git revert` the merge and push). No database rollback is needed because the migration is additive.

**After pulling this branch locally:** stop the running dev server, run `npx prisma generate`, start it again. A server started before the migration holds the old database client and will error on the new fields.

## Blockers and owners

| Blocker | Exact action | Owner |
|---|---|---|
| GSC live sync | Create service account, enable Search Console API, add it as a user on the BBG property, set `GOOGLE_SERVICE_ACCOUNT_JSON`, give the exact property id | BBG Search Console owner |
| External alert | Set `RESEND_API_KEY` and `ALERT_EMAIL_TO` (or Slack / Telegram values) in `.env` and Vercel | Account holder |
| 15-minute schedule | Set `CRON_SECRET` in Vercel; set `APP_URL` and `CRON_SECRET` as GitHub repository secrets | Account holder |
| Page speed | Set `PAGESPEED_API_KEY` | Account holder |
| Staging | Set the three auth/database variables for the Vercel Preview environment | Account holder |
| Founder password | Still the seed value; rotate with `npm run auth:reset-founder` | Account holder |

## Next executable step

Last passing gate: `npx vitest run` (211 tests). Next: supply the Google service-account key and the BBG property id, then on the SEO page press **Test access** and **Sync**, and reconcile clicks and impressions against Search Console for the same 28-day window and search type.

## Hosting and schedule (2026-11-23)

The app runs at https://app.valiantfirm.net on Hostinger (Node.js 22). Scheduled work is
run by Hostinger cron jobs on that account, each a single `curl` to a secret-gated endpoint:

| Schedule (UTC) | Endpoint |
|---|---|
| every 15 minutes | `/api/cron/run-monitors` |
| minutes 7, 22, 37, 52 | `/api/cron/process-outreach` |
| 11:20, 11:35, 11:50 daily | `/api/cron/sync-gsc` |
| 12:05, 12:20, 12:35, 12:50 daily | `/api/cron/sync-ga4` |
| 13:10 daily | `/api/cron/sync-gbp` |
| 13:30 daily | `/api/cron/prospect` |

The GitHub Actions schedule was removed so there is one scheduler. Environment variables
live in Hostinger (Node.js > Environment variables); changing `CRON_SECRET` there means
updating the six cron commands too.

Deploy: export the committed code (`git archive HEAD`) to a folder outside AppData and
deploy that folder; the build runs on the server with one worker (`next.config.mjs`).
