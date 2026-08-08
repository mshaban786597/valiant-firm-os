import {
  ActivitySquare,
  BarChart3,
  Bot,
  Briefcase,
  ClipboardList,
  Contact,
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

/**
 * Single source of truth for primary navigation. Rendered by both the desktop
 * sidebar and the mobile menu so they never drift out of sync.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/outreach", label: "Outreach", icon: Megaphone },
  { href: "/pipeline", label: "Pipeline", icon: Layers },
  { href: "/clients", label: "Clients", icon: Briefcase },
  { href: "/campaigns", label: "Campaigns", icon: Target },
  { href: "/ecommerce", label: "Ecommerce", icon: ShoppingCart },
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

/** True when `pathname` is the given nav href or a nested route under it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}
