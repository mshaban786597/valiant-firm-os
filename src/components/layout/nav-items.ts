import {
  ActivitySquare,
  BarChart3,
  Bot,
  Briefcase,
  Globe,
  Inbox,
  ClipboardCheck,
  ClipboardList,
  Contact,
  Cpu,
  CreditCard,
  Gauge,
  HeartPulse,
  History,
  Layers,
  LineChart,
  Mail,
  MapPin,
  Megaphone,
  Plug,
  Radar,
  Receipt,
  Rocket,
  Search,
  SearchCode,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Target,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Single source of truth for primary navigation, grouped into the two
 * workspaces (Client Operations / Sales & Outreach) plus shared controls.
 * Rendered by both the desktop sidebar and the mobile menu.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Command",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Gauge },
      { href: "/automation-system", label: "Automation System", icon: Cpu },
      { href: "/approvals", label: "Review & Approvals", icon: ClipboardCheck },
      { href: "/search", label: "Search", icon: SearchCode },
      { href: "/activity", label: "Activity", icon: History },
    ],
  },
  {
    title: "Client Operations",
    items: [
      { href: "/clients", label: "Clients", icon: Briefcase },
      { href: "/sites", label: "Websites", icon: Globe },
      { href: "/inbox", label: "Leads Inbox", icon: Inbox },
      { href: "/delivery", label: "Delivery", icon: ClipboardList },
      { href: "/monitoring", label: "Monitoring", icon: ShieldAlert },
      { href: "/health", label: "Health", icon: HeartPulse },
      { href: "/seo", label: "SEO / GSC", icon: Search },
      { href: "/analytics", label: "Analytics (GA4)", icon: LineChart },
      { href: "/gbp", label: "Google Business", icon: MapPin },
      { href: "/google-ads", label: "Google Ads", icon: BarChart3 },
      { href: "/reports", label: "Reports", icon: ActivitySquare },
      { href: "/ecommerce", label: "Ecommerce", icon: ShoppingCart },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/expenses", label: "Tool Expenses", icon: Receipt },
    ],
  },
  {
    title: "Sales & Outreach",
    items: [
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/contacts", label: "Contacts", icon: Contact },
      { href: "/outreach", label: "Outreach", icon: Megaphone },
      { href: "/pipeline", label: "Pipeline", icon: Layers },
      { href: "/campaigns", label: "Campaigns", icon: Target },
      { href: "/email-campaigns", label: "Email", icon: Mail },
      { href: "/rank-rent", label: "Rank & Rent", icon: Radar },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/ai-logs", label: "AI Logs", icon: Bot },
      { href: "/saas-roadmap", label: "SaaS Roadmap", icon: Rocket },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Flat list of every nav item (search, command palette, tests). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.reduce<NavItem[]>(
  (all, g) => all.concat(g.items),
  [],
);

/** The nav entry a page belongs to (the longest matching address), for its icon. */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

/** True when `pathname` is the given nav href or a nested route under it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}
