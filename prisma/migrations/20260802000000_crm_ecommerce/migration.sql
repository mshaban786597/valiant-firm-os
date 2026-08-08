-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('GOOGLE_ADS', 'META', 'SEO', 'GBP', 'EMAIL', 'SMM', 'ECOMMERCE', 'OTHER');

-- CreateEnum
CREATE TYPE "EcommercePlatform" AS ENUM ('AMAZON', 'EBAY', 'ETSY', 'SHOPIFY', 'WOOCOMMERCE', 'WALMART', 'BIGCOMMERCE', 'SQUARESPACE', 'OTHER');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "role" TEXT,
    "source" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerId" TEXT,
    "notes" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "budgetCents" INTEGER NOT NULL DEFAULT 0,
    "goals" TEXT,
    "managerId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcommerceStore" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "platform" "EcommercePlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "storeUrl" TEXT,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcommerceStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcommerceProduct" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "inventory" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "url" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcommerceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcommerceOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "itemCount" INTEGER NOT NULL DEFAULT 1,
    "customerName" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcommerceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcommerceMetric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcommerceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_organizationId_idx" ON "Contact"("organizationId");

-- CreateIndex
CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_idx" ON "Campaign"("organizationId");

-- CreateIndex
CREATE INDEX "Campaign_clientId_idx" ON "Campaign"("clientId");

-- CreateIndex
CREATE INDEX "Campaign_channel_idx" ON "Campaign"("channel");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "EcommerceStore_organizationId_idx" ON "EcommerceStore"("organizationId");

-- CreateIndex
CREATE INDEX "EcommerceStore_clientId_idx" ON "EcommerceStore"("clientId");

-- CreateIndex
CREATE INDEX "EcommerceStore_platform_idx" ON "EcommerceStore"("platform");

-- CreateIndex
CREATE INDEX "EcommerceProduct_organizationId_idx" ON "EcommerceProduct"("organizationId");

-- CreateIndex
CREATE INDEX "EcommerceProduct_storeId_idx" ON "EcommerceProduct"("storeId");

-- CreateIndex
CREATE INDEX "EcommerceProduct_sku_idx" ON "EcommerceProduct"("sku");

-- CreateIndex
CREATE INDEX "EcommerceOrder_organizationId_idx" ON "EcommerceOrder"("organizationId");

-- CreateIndex
CREATE INDEX "EcommerceOrder_storeId_idx" ON "EcommerceOrder"("storeId");

-- CreateIndex
CREATE INDEX "EcommerceOrder_placedAt_idx" ON "EcommerceOrder"("placedAt");

-- CreateIndex
CREATE INDEX "EcommerceOrder_status_idx" ON "EcommerceOrder"("status");

-- CreateIndex
CREATE INDEX "EcommerceMetric_organizationId_idx" ON "EcommerceMetric"("organizationId");

-- CreateIndex
CREATE INDEX "EcommerceMetric_storeId_idx" ON "EcommerceMetric"("storeId");

-- CreateIndex
CREATE INDEX "EcommerceMetric_date_idx" ON "EcommerceMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EcommerceMetric_storeId_date_key" ON "EcommerceMetric"("storeId", "date");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceStore" ADD CONSTRAINT "EcommerceStore_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceStore" ADD CONSTRAINT "EcommerceStore_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceProduct" ADD CONSTRAINT "EcommerceProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceProduct" ADD CONSTRAINT "EcommerceProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "EcommerceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceOrder" ADD CONSTRAINT "EcommerceOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceOrder" ADD CONSTRAINT "EcommerceOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "EcommerceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceMetric" ADD CONSTRAINT "EcommerceMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommerceMetric" ADD CONSTRAINT "EcommerceMetric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "EcommerceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

