-- AlterTable
ALTER TABLE "Site" ADD COLUMN "intakeKey" TEXT;
CREATE UNIQUE INDEX "Site_intakeKey_key" ON "Site"("intakeKey");

-- CreateTable
CREATE TABLE "SiteLead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "clientId" TEXT,
    "source" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "pageUrl" TEXT,
    "formName" TEXT,
    "fields" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteLead_siteId_dedupeKey_key" ON "SiteLead"("siteId", "dedupeKey");
CREATE INDEX "SiteLead_organizationId_receivedAt_idx" ON "SiteLead"("organizationId", "receivedAt");
CREATE INDEX "SiteLead_organizationId_status_idx" ON "SiteLead"("organizationId", "status");
CREATE INDEX "SiteLead_siteId_receivedAt_idx" ON "SiteLead"("siteId", "receivedAt");
ALTER TABLE "SiteLead" ADD CONSTRAINT "SiteLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteLead" ADD CONSTRAINT "SiteLead_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteLead" ADD CONSTRAINT "SiteLead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
