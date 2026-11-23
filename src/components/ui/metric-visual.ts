import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BarChart3,
  Bell,
  Bot,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Contact,
  Eye,
  FileBarChart,
  FileSignature,
  FileText,
  Gauge,
  Globe,
  Handshake,
  HeartPulse,
  Inbox,
  Layers,
  Link2,
  Mail,
  MailOpen,
  MapPin,
  Megaphone,
  MessageSquare,
  MousePointerClick,
  Package,
  Percent,
  Phone,
  Plug,
  Radar,
  Receipt,
  Search,
  Send,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Colour family of a figure's icon chip. It says what kind of number this is, not whether it is good. */
export type Tone = "brand" | "money" | "alert" | "wait" | "info" | "neutral";

export interface MetricVisual {
  icon: LucideIcon;
  tone: Tone;
}

export const TONE_CHIP: Record<Tone, string> = {
  brand: "bg-valiant-soft text-valiant dark:text-red-300",
  money: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  alert: "bg-red-500/15 text-red-600 dark:text-red-300",
  wait: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  info: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  neutral: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

/**
 * First match wins, so the specific phrases sit above the general ones
 * ("at-risk clients" before "clients", "tool costs" before "tools").
 */
const RULES: [RegExp, LucideIcon, Tone][] = [
  // Named things that contain a more general word
  [/rank & rent|rank-and-rent|rented/, Radar, "brand"],
  [/uptime|pass rate/, HeartPulse, "money"],
  [/\bai\b/, Bot, "neutral"],
  [/reviews\b|rating/, Star, "wait"],
  [/report/, FileBarChart, "neutral"],
  [/position|top 3|page 1|striking|quick wins|long shots/, Target, "info"],
  [/moved up/, TrendingUp, "money"],

  // Trouble and waiting
  [/incident|open issues|failed|needs attention/, ShieldAlert, "alert"],
  [/at-risk|churn|moved down|not seen|rejected|unsub|bounce/, TrendingDown, "alert"],
  [/alert/, Bell, "alert"],
  [/warning/, AlertTriangle, "wait"],
  [/waiting|review|draft|pending|paused|not entered|unlinked/, ClipboardCheck, "wait"],
  [/task/, ClipboardList, "wait"],

  // Money
  [/cost|spend|investment|budget|cpa/, Receipt, "money"],
  [/invoice/, FileText, "money"],
  [/collected|paid/, Banknote, "money"],
  [/outstanding|subtotal|net after/, Wallet, "money"],
  [/mrr|revenue|\brent\b|order value|range/, TrendingUp, "money"],

  // Sales and outreach
  [/proposal/, FileSignature, "info"],
  [/won|deal|\bwins\b/, Handshake, "money"],
  [/meeting|booked/, CalendarCheck, "info"],
  [/repl/, MessageSquare, "info"],
  [/open rate|opens/, MailOpen, "info"],
  [/sent|sends|outreach|recipients/, Send, "info"],
  [/enquir/, Inbox, "brand"],
  [/prospect|qualified|lead/, Users, "brand"],
  [/campaign|posts/, Megaphone, "info"],
  [/contact/, Contact, "neutral"],
  [/email/, Mail, "info"],

  // Search and analytics
  [/ctr|\brate\b|avg conversion/, Percent, "info"],
  [/conversions|key events/, Zap, "money"],
  [/clicks/, MousePointerClick, "info"],
  [/impressions|views/, Eye, "info"],
  [/ranking|ranked|queries|keyword/, Search, "info"],
  [/backlink|referring/, Link2, "neutral"],
  [/authority|health score/, Gauge, "info"],
  [/\busers\b/, Users, "info"],
  [/sessions|visits/, Activity, "info"],
  [/calls|phone/, Phone, "info"],
  [/profiles|address|gbp/, MapPin, "info"],

  // Operations
  [/websites|sites|our own|properties|domain/, Globe, "info"],
  [/client/, Briefcase, "brand"],
  [/automation|workflow/, Workflow, "neutral"],
  [/live verified|approved|confirmed|attended|\bactive\b/, BadgeCheck, "money"],
  [/connected|connections|running on live|tools/, Plug, "info"],
  [/orders|stores/, ShoppingCart, "info"],
  [/units|products/, Package, "neutral"],
  [/\bnew\b/, Sparkles, "brand"],
  [/this week|last |synced/, Clock, "neutral"],
  [/checks|healthy/, CheckCircle2, "money"],
  [/total|\ball\b/, Layers, "neutral"],
];

const FALLBACK: MetricVisual = { icon: BarChart3, tone: "neutral" };

/** The icon and colour family for a figure, chosen from its label. */
export function metricVisual(label: string): MetricVisual {
  const text = ` ${label.toLowerCase()} `;
  for (const [pattern, icon, tone] of RULES) {
    if (pattern.test(text)) return { icon, tone };
  }
  return FALLBACK;
}
