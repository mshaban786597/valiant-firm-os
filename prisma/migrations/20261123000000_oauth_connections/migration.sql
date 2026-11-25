-- CreateTable
CREATE TABLE "OAuthConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "connectedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OAuthConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthConnection_organizationId_provider_key" ON "OAuthConnection"("organizationId", "provider");
ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
