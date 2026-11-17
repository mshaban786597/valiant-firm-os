-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN "kind" TEXT;

-- CreateTable
CREATE TABLE "SeoSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "location" TEXT,
    "data" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeoSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoSnapshot_organizationId_domain_kind_observedAt_idx" ON "SeoSnapshot"("organizationId", "domain", "kind", "observedAt");
ALTER TABLE "SeoSnapshot" ADD CONSTRAINT "SeoSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
