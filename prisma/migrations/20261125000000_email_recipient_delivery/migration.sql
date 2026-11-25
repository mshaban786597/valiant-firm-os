-- AlterTable: what the email service said about each campaign email.
ALTER TABLE "EmailRecipient" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "EmailRecipient" ADD COLUMN "error" TEXT;

-- CreateIndex
CREATE INDEX "EmailRecipient_providerMessageId_idx" ON "EmailRecipient"("providerMessageId");
