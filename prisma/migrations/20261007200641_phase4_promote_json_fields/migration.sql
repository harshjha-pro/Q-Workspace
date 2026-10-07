-- Phase 4 (Q-39): promote fields that Phase 3 kept as JSON in text columns to real columns.
-- Additive only: new nullable / defaulted columns, then a backfill from the JSON. Nothing is dropped.

-- AlterTable
ALTER TABLE "EngagementLetter" ADD COLUMN "leadId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "ackDate" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ackNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "periodFrom" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "periodTo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "recipientGstin" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "retainerPeriod" TEXT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "serviceTemplateId" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN "tdsPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Receipt" ADD COLUMN "reversedAt" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "reversedReason" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "reversedById" TEXT;

-- AlterTable
ALTER TABLE "ServiceTemplate" ADD COLUMN "engagementType" TEXT;
ALTER TABLE "ServiceTemplate" ADD COLUMN "budgetMinutes" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the JSON kept in notes (only rows whose notes hold a JSON object).
UPDATE "Invoice" SET
  "recipientGstin" = json_extract("notes", '$.recipientGstin'),
  "ackNo" = json_extract("notes", '$.ackNo'),
  "ackDate" = json_extract("notes", '$.ackDate'),
  "cancelReason" = json_extract("notes", '$.cancelReason'),
  "retainerPeriod" = json_extract("notes", '$.retainerPeriod'),
  "periodFrom" = json_extract("notes", '$.periodFrom'),
  "periodTo" = json_extract("notes", '$.periodTo'),
  "notes" = COALESCE(json_extract("notes", '$.text'), '')
WHERE "notes" LIKE '{%' AND json_valid("notes");

UPDATE "Receipt" SET
  "tdsPaise" = COALESCE(json_extract("notes", '$.tdsPaise'), 0),
  "reversedAt" = json_extract("notes", '$.reversedAt'),
  "reversedReason" = json_extract("notes", '$.reversedReason'),
  "reversedById" = json_extract("notes", '$.reversedById'),
  "notes" = COALESCE(json_extract("notes", '$.text'), '')
WHERE "notes" LIKE '{%' AND json_valid("notes");

UPDATE "EngagementLetter" SET "leadId" = substr("clientId", 6) WHERE "clientId" LIKE 'LEAD:%';
