-- CreateTable
CREATE TABLE "Ga4Property" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "propertyId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accountName" TEXT,
    "websiteUrl" TEXT,
    "syncState" TEXT NOT NULL DEFAULT 'never',
    "lastSyncAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "sessions28d" INTEGER NOT NULL DEFAULT 0,
    "users28d" INTEGER NOT NULL DEFAULT 0,
    "newUsers28d" INTEGER NOT NULL DEFAULT 0,
    "keyEvents28d" INTEGER NOT NULL DEFAULT 0,
    "views28d" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION,
    "avgEngagementSec" DOUBLE PRECISION,
    "prevSessions28d" INTEGER,
    "prevUsers28d" INTEGER,
    "prevKeyEvents28d" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ga4Property_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ga4Metric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ga4PropertyId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "users" INTEGER NOT NULL DEFAULT 0,
    "keyEvents" INTEGER NOT NULL DEFAULT 0,
    "engagedSessions" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ga4Metric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ga4Property_organizationId_propertyId_key" ON "Ga4Property"("organizationId", "propertyId");
CREATE INDEX "Ga4Property_organizationId_clientId_idx" ON "Ga4Property"("organizationId", "clientId");
CREATE UNIQUE INDEX "Ga4Metric_ga4PropertyId_dimension_key_periodStart_periodEnd_key" ON "Ga4Metric"("ga4PropertyId", "dimension", "key", "periodStart", "periodEnd");
CREATE INDEX "Ga4Metric_organizationId_ga4PropertyId_dimension_idx" ON "Ga4Metric"("organizationId", "ga4PropertyId", "dimension");
ALTER TABLE "Ga4Property" ADD CONSTRAINT "Ga4Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ga4Property" ADD CONSTRAINT "Ga4Property_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ga4Metric" ADD CONSTRAINT "Ga4Metric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ga4Metric" ADD CONSTRAINT "Ga4Metric_ga4PropertyId_fkey" FOREIGN KEY ("ga4PropertyId") REFERENCES "Ga4Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
