"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivitySquare,
  BarChart3,
  Bot,
  Briefcase,
  ClipboardList,
  CreditCard,
  Gauge,
  HeartPulse,
  History,
  Layers,
  LineChart,
  Mail,
  MapPin,
  Megaphone,
  Radar,
  Rocket,
  Search,
  SearchCode,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/outreach", label: "Outreach", icon: Megaphone },
  { href: "/pipeline", label: "Pipeline", icon: Layers },
  { href: "/clients", label: "Clients", icon: Briefcase },
  { href: "/delivery", label: "Delivery", icon: ClipboardList },
  { href: "/content", label: "Content", icon: LineChart },
  { href: "/reports", label: "Reports", icon: ActivitySquare },
  { href: "/health", label: "Health", icon: HeartPulse },
  { href: "/seo", label: "SEO / GSC", icon: Search },
  { href: "/gbp", label: "Google Business", icon: MapPin },
  { href: "/google-ads", label: "Google Ads", icon: BarChart3 },
  { href: "/email-campaigns", label: "Email", icon: Mail },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/ai-logs", label: "AI Logs", icon: Bot },
  { href: "/rank-rent", label: "Rank & Rent", icon: Radar },
  { href: "/saas-roadmap", label: "SaaS Roadmap", icon: Rocket },
  { href: "/search", label: "Search", icon: SearchCode },
  { href: "/activity", label: "Activity", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 border-r border-card-border bg-card/80 backdrop-blur lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-card-border px-5">
        <div className="h-8 w-8 rounded-lg bg-valiant shadow-[0_0_24px_rgba(211,4,4,0.35)]" />
        <div className="leading-tight">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Valiant Firm
          </div>
          <div className="text-sm font-semibold text-foreground">Agency OS</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-valiant-soft text-foreground ring-1 ring-valiant/30"
                  : "text-muted hover:bg-card-border/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-card-border p-4 text-xs text-muted">
        Internal operating layer · SaaS-ready multi-tenant schema.
      </div>
    </aside>
  );
}
