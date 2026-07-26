import { PageShell } from "@/components/layout/page-shell";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { prisma } from "@/lib/prisma";
import { requireSessionOrg } from "@/lib/session-org";

export default async function SettingsPage() {
  const { organizationId, role } = await requireSessionOrg();

  const [org, roles, accentSetting] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, slug: true },
    }),
    prisma.role.findMany({ orderBy: { key: "asc" } }),
    prisma.setting.findUnique({
      where: {
        organizationId_key: { organizationId, key: "brand.accent" },
      },
      select: { value: true },
    }),
  ]);

  const rawAccent = accentSetting?.value;
  const accentHex =
    typeof rawAccent === "string" && /^#[0-9A-Fa-f]{6}$/i.test(rawAccent)
      ? rawAccent
      : "#D30404";

  const placeholders = [
    ["DATABASE_URL", "Supabase Postgres connection string"],
    ["NEXTAUTH_SECRET", "Random secret for JWT/session crypto"],
    ["NEXTAUTH_URL", "Public site URL (e.g., https://os.valiantfirm.com)"],
    ["OPENAI_API_KEY", "Optional — enables AI JSON completions"],
    ["OPENAI_MODEL", "Optional override (default gpt-4o-mini)"],
    ["ANTHROPIC_API_KEY", "Optional Claude fallback"],
    ["WEBHOOK_SECRET", "HMAC secret for /api/webhooks/automation"],
    ["STRIPE_SECRET_KEY", "Placeholder — billing integrations"],
    ["INSTANTLY_API_KEY", "Placeholder — outreach sending"],
    ["LEMLIST_API_KEY", "Placeholder"],
    ["GOOGLE_SERVICE_ACCOUNT_JSON", "Placeholder — GA4/GSC/GBP APIs"],
    ["DATAFORSEO_LOGIN", "Placeholder"],
    ["DATAFORSEO_PASSWORD", "Placeholder"],
    ["SLACK_SIGNING_SECRET", "Placeholder"],
  ];

  return (
    <PageShell title="Settings & Integrations">
      <SettingsWorkspace
        organizationName={org?.name ?? "—"}
        organizationSlug={org?.slug ?? "—"}
        role={role}
        accentHex={accentHex}
      />

      <div className="rounded-xl border border-card-border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          RBAC seed · roles table
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <span
              key={r.id}
              className="rounded-full border border-card-border bg-background/40 px-3 py-1 text-xs font-semibold"
            >
              {r.key}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Attach additional memberships via the OrganizationMember join table (future multi-user ops
          console).
        </p>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Environment variables (no secrets committed)
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-card-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background/40 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {placeholders.map(([k, v]) => (
                <tr key={k} className="border-t border-card-border hover:bg-background/30">
                  <td className="px-4 py-3 font-mono text-xs">{k}</td>
                  <td className="px-4 py-3 text-xs text-muted">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
