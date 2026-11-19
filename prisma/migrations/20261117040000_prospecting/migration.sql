-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "outreachCategory" TEXT;
ALTER TABLE "OutreachSend" ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "openedAt" TIMESTAMP(3),
  ADD COLUMN "openCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "clickedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProspectTarget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProspectTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProspectingRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetId" TEXT,
    "query" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultsSeen" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "skipped" JSONB,
    "error" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProspectingRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProspectTarget_organizationId_keyword_city_state_key" ON "ProspectTarget"("organizationId", "keyword", "city", "state");
CREATE INDEX "ProspectTarget_organizationId_active_lastRunAt_idx" ON "ProspectTarget"("organizationId", "active", "lastRunAt");
CREATE INDEX "ProspectingRun_organizationId_createdAt_idx" ON "ProspectingRun"("organizationId", "createdAt");
ALTER TABLE "ProspectTarget" ADD CONSTRAINT "ProspectTarget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProspectingRun" ADD CONSTRAINT "ProspectingRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProspectingRun" ADD CONSTRAINT "ProspectingRun_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ProspectTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
