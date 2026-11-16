-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "approvalId" TEXT,
ADD COLUMN     "clientFacing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "incidentId" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'monthly',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "FounderAlert" ADD COLUMN     "incidentId" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AiLog" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "errorDetail" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "runId" TEXT;

-- AlterTable
ALTER TABLE "GscProperty" ADD COLUMN     "dataSource" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "dataThrough" TIMESTAMP(3),
ADD COLUMN     "disconnectedAt" TIMESTAMP(3),
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "propertyType" TEXT,
ADD COLUMN     "searchType" TEXT NOT NULL DEFAULT 'web',
ADD COLUMN     "syncState" TEXT NOT NULL DEFAULT 'never';

-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "confirmAfter" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "environment" TEXT NOT NULL DEFAULT 'production',
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maintenanceUntil" TIMESTAMP(3),
ADD COLUMN     "owner" TEXT;

-- AlterTable
ALTER TABLE "MonitorCheck" ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'scheduled';

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "environment" TEXT NOT NULL DEFAULT 'production',
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerRef" TEXT;

-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "executedAt" TIMESTAMP(3),
ADD COLUMN     "executionStatus" TEXT NOT NULL DEFAULT 'not_started',
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "incidentId" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rolledBackAt" TIMESTAMP(3),
ADD COLUMN     "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GscMetric" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "searchType" TEXT NOT NULL DEFAULT 'web',
    "source" TEXT NOT NULL DEFAULT 'gsc_api',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GscMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEvidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "surface" TEXT,
    "query" TEXT,
    "location" TEXT,
    "depth" INTEGER,
    "position" INTEGER,
    "url" TEXT,
    "finding" TEXT NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSend" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerMessageId" TEXT,
    "threadId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cancelReason" TEXT,
    "approvalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachReply" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "threadId" TEXT,
    "label" TEXT NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "clientId" TEXT,
    "calendarSource" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationVerification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestDetail" TEXT,
    "lastLiveVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseVerification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "baselineUrl" TEXT NOT NULL,
    "candidateUrl" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "checked" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GscMetric_propertyId_dimension_idx" ON "GscMetric"("propertyId", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "GscMetric_propertyId_dimension_key_periodStart_periodEnd_se_key" ON "GscMetric"("propertyId", "dimension", "key", "periodStart", "periodEnd", "searchType");

-- CreateIndex
CREATE INDEX "LeadEvidence_organizationId_idx" ON "LeadEvidence"("organizationId");

-- CreateIndex
CREATE INDEX "LeadEvidence_leadId_idx" ON "LeadEvidence"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachSend_idempotencyKey_key" ON "OutreachSend"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutreachSend_organizationId_status_scheduledFor_idx" ON "OutreachSend"("organizationId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "OutreachSend_leadId_idx" ON "OutreachSend"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_organizationId_email_key" ON "Suppression"("organizationId", "email");

-- CreateIndex
CREATE INDEX "OutreachReply_organizationId_idx" ON "OutreachReply"("organizationId");

-- CreateIndex
CREATE INDEX "OutreachReply_leadId_idx" ON "OutreachReply"("leadId");

-- CreateIndex
CREATE INDEX "Meeting_organizationId_startsAt_idx" ON "Meeting"("organizationId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_organizationId_calendarSource_externalEventId_key" ON "Meeting"("organizationId", "calendarSource", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationVerification_organizationId_integrationId_key" ON "IntegrationVerification"("organizationId", "integrationId");

-- CreateIndex
CREATE INDEX "ReleaseVerification_organizationId_createdAt_idx" ON "ReleaseVerification"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "GscMetric" ADD CONSTRAINT "GscMetric_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "GscProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvidence" ADD CONSTRAINT "LeadEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvidence" ADD CONSTRAINT "LeadEvidence_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSend" ADD CONSTRAINT "OutreachSend_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSend" ADD CONSTRAINT "OutreachSend_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachReply" ADD CONSTRAINT "OutreachReply_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachReply" ADD CONSTRAINT "OutreachReply_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationVerification" ADD CONSTRAINT "IntegrationVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseVerification" ADD CONSTRAINT "ReleaseVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: move existing pilot fixtures into the demo scope (timestamps untouched).
UPDATE "Lead" SET "isDemo" = true WHERE "businessName" LIKE '[PILOT]%';
UPDATE "Deal" SET "isDemo" = true WHERE "businessName" LIKE '[PILOT]%';
UPDATE "Client" SET "isDemo" = true WHERE "businessName" LIKE '[PILOT]%';
UPDATE "Task" SET "isDemo" = true WHERE "title" LIKE '%[PILOT]%' OR "clientId" IN (SELECT "id" FROM "Client" WHERE "isDemo" = true);
UPDATE "Monitor" SET "isDemo" = true, "environment" = 'fixture' WHERE "name" LIKE '[PILOT]%';
UPDATE "Incident" SET "isDemo" = true, "environment" = 'fixture' WHERE "title" LIKE '%[PILOT]%';
UPDATE "FounderAlert" SET "isDemo" = true WHERE "title" LIKE '%[PILOT]%';
-- An alert whose incident already recovered is history, not a current alert.
UPDATE "FounderAlert" a SET "incidentId" = i."id", "resolvedAt" = i."resolvedAt"
  FROM "Incident" i
  WHERE a."organizationId" = i."organizationId" AND a."isDemo" = true AND i."isDemo" = true
    AND i."status" = 'RESOLVED' AND a."incidentId" IS NULL;
-- Checks written before triggers were recorded on fixture monitors were simulated.
UPDATE "MonitorCheck" SET "trigger" = 'simulated' WHERE "monitorId" IN (SELECT "id" FROM "Monitor" WHERE "isDemo" = true);
UPDATE "MonitorCheck" SET "trigger" = 'manual' WHERE "monitorId" IN (SELECT "id" FROM "Monitor" WHERE "isDemo" = false);

-- At most one open incident per (tenant, fingerprint): dedup holds under concurrency.
CREATE UNIQUE INDEX "Incident_open_fingerprint_key" ON "Incident"("organizationId", "fingerprint") WHERE "status" <> 'RESOLVED';
