-- AlterTable: when a person agreed to marketing email (null = did not agree).
ALTER TABLE "Client" ADD COLUMN "emailConsentAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "emailConsentAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "emailConsentAt" TIMESTAMP(3);
