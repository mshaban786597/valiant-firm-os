import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { notify } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";

/** Send a test alert to every configured channel and report what actually happened. */
export async function POST() {
  const org = await requirePermission("org.settings");
  if (!org.ok) return org.response;
  const results = await notify({
    organizationId: org.organizationId,
    event: "test",
    title: "Valiant Agency OS alerts are connected",
    body: "This is a test notification.",
    path: "/integrations",
  });
  return NextResponse.json({ results });
}
