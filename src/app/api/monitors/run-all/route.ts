import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-permission";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { runMonitorsBatch } from "@/lib/monitoring/run-batch";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Run every enabled automated monitor for this org now ("run full cycle"). */
export async function POST() {
  const org = await requirePermission("monitor.write");
  if (!org.ok) return org.response;

  const monitors = await prisma.monitor.findMany({
    where: {
      organizationId: org.organizationId,
      enabled: true,
      type: { notIn: ["LEAD_ROUTE", "CUSTOM"] },
    },
    orderBy: { lastCheckAt: { sort: "asc", nulls: "first" } },
    take: 60,
  });

  const summary = await runMonitorsBatch(monitors, 8);

  await writeAuditLog({
    organizationId: org.organizationId,
    userId: org.userId,
    action: "monitor.run_all",
    entity: "Monitor",
    entityId: "all",
    meta: { ...summary },
  });

  return NextResponse.json({ summary });
}
