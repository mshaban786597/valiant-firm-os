-- CreateTable
CREATE TABLE "GscRankDay" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GscRankDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GscRankDay_propertyId_query_date_key" ON "GscRankDay"("propertyId", "query", "date");
CREATE INDEX "GscRankDay_propertyId_date_idx" ON "GscRankDay"("propertyId", "date");
ALTER TABLE "GscRankDay" ADD CONSTRAINT "GscRankDay_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "GscProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
