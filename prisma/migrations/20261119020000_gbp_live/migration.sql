-- AlterTable
ALTER TABLE "GbpLocation" ADD COLUMN "accountName" TEXT,
  ADD COLUMN "mapsUri" TEXT,
  ADD COLUMN "placeId" TEXT,
  ADD COLUMN "missing" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "dataSource" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "syncState" TEXT NOT NULL DEFAULT 'never',
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "reviewsState" TEXT,
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "periodEnd" TIMESTAMP(3),
  ADD COLUMN "searchViews28d" INTEGER,
  ADD COLUMN "mapsViews28d" INTEGER,
  ADD COLUMN "calls28d" INTEGER,
  ADD COLUMN "websiteClicks28d" INTEGER,
  ADD COLUMN "directions28d" INTEGER;

-- CreateTable
CREATE TABLE "GbpMetricDay" (
    "id" TEXT NOT NULL,
    "gbpLocationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "searchViews" INTEGER NOT NULL DEFAULT 0,
    "mapsViews" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "websiteClicks" INTEGER NOT NULL DEFAULT 0,
    "directions" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GbpMetricDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GbpMetricDay_gbpLocationId_date_key" ON "GbpMetricDay"("gbpLocationId", "date");
ALTER TABLE "GbpMetricDay" ADD CONSTRAINT "GbpMetricDay_gbpLocationId_fkey" FOREIGN KEY ("gbpLocationId") REFERENCES "GbpLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
