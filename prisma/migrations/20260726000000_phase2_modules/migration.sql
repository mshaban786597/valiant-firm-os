-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "number" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "subtotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GbpLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "gbpId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "category" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "postsLast30Days" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GbpLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GscProperty" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "siteUrl" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "clicks28d" INTEGER NOT NULL DEFAULT 0,
    "impressions28d" INTEGER NOT NULL DEFAULT 0,
    "avgPosition" DOUBLE PRECISION,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GscProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GscKeyword" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GscKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleAdsCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENABLED',
    "spend" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "costPerConv" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleAdsCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "unsubscribes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT,
    "clientId" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLineItem_organizationId_idx" ON "InvoiceLineItem"("organizationId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "GbpLocation_gbpId_key" ON "GbpLocation"("gbpId");

-- CreateIndex
CREATE INDEX "GbpLocation_organizationId_idx" ON "GbpLocation"("organizationId");

-- CreateIndex
CREATE INDEX "GbpLocation_clientId_idx" ON "GbpLocation"("clientId");

-- CreateIndex
CREATE INDEX "GscProperty_organizationId_idx" ON "GscProperty"("organizationId");

-- CreateIndex
CREATE INDEX "GscProperty_clientId_idx" ON "GscProperty"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "GscProperty_organizationId_siteUrl_key" ON "GscProperty"("organizationId", "siteUrl");

-- CreateIndex
CREATE INDEX "GscKeyword_propertyId_idx" ON "GscKeyword"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAdsCampaign_campaignId_key" ON "GoogleAdsCampaign"("campaignId");

-- CreateIndex
CREATE INDEX "GoogleAdsCampaign_organizationId_idx" ON "GoogleAdsCampaign"("organizationId");

-- CreateIndex
CREATE INDEX "GoogleAdsCampaign_clientId_idx" ON "GoogleAdsCampaign"("clientId");

-- CreateIndex
CREATE INDEX "EmailCampaign_organizationId_idx" ON "EmailCampaign"("organizationId");

-- CreateIndex
CREATE INDEX "EmailCampaign_status_idx" ON "EmailCampaign"("status");

-- CreateIndex
CREATE INDEX "EmailRecipient_campaignId_idx" ON "EmailRecipient"("campaignId");

-- CreateIndex
CREATE INDEX "EmailRecipient_email_idx" ON "EmailRecipient"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalToken_token_key" ON "ClientPortalToken"("token");

-- CreateIndex
CREATE INDEX "ClientPortalToken_organizationId_idx" ON "ClientPortalToken"("organizationId");

-- CreateIndex
CREATE INDEX "ClientPortalToken_clientId_idx" ON "ClientPortalToken"("clientId");

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GbpLocation" ADD CONSTRAINT "GbpLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GbpLocation" ADD CONSTRAINT "GbpLocation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GscProperty" ADD CONSTRAINT "GscProperty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GscProperty" ADD CONSTRAINT "GscProperty_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GscKeyword" ADD CONSTRAINT "GscKeyword_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "GscProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleAdsCampaign" ADD CONSTRAINT "GoogleAdsCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleAdsCampaign" ADD CONSTRAINT "GoogleAdsCampaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailRecipient" ADD CONSTRAINT "EmailRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalToken" ADD CONSTRAINT "ClientPortalToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalToken" ADD CONSTRAINT "ClientPortalToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

