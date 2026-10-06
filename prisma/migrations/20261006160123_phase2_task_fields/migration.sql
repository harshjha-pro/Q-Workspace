-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "complianceTypeCode" TEXT,
    "partyKey" TEXT NOT NULL DEFAULT '-',
    "periodKey" TEXT NOT NULL DEFAULT '-',
    "gstinId" TEXT,
    "directorId" TEXT,
    "title" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL DEFAULT '',
    "originalDueDate" TEXT,
    "effectiveDueDate" TEXT,
    "isProvisional" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "stageTemplateVersionId" TEXT,
    "stageIndex" INTEGER NOT NULL DEFAULT 0,
    "pendingFromClient" BOOLEAN NOT NULL DEFAULT false,
    "pendingSince" TEXT,
    "underReview" BOOLEAN NOT NULL DEFAULT false,
    "ackType" TEXT,
    "ackNumber" TEXT,
    "filedDate" TEXT,
    "filedById" TEXT,
    "signoffRecorded" BOOLEAN NOT NULL DEFAULT false,
    "udinRecordId" TEXT,
    "notApplicableReason" TEXT,
    "supersededByTaskId" TEXT,
    "amendsTaskId" TEXT,
    "budgetMinutes" INTEGER NOT NULL DEFAULT 0,
    "isOneOff" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" DATETIME,
    "periodStart" TEXT NOT NULL DEFAULT '',
    "periodEnd" TEXT NOT NULL DEFAULT '',
    "dueBasis" TEXT NOT NULL DEFAULT '',
    "holidayShifted" BOOLEAN NOT NULL DEFAULT false,
    "taxDuePaise" INTEGER,
    "underReviewSince" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_gstinId_fkey" FOREIGN KEY ("gstinId") REFERENCES "GSTIN" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "Director" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_stageTemplateVersionId_fkey" FOREIGN KEY ("stageTemplateVersionId") REFERENCES "StageTemplateVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("ackNumber", "ackType", "amendsTaskId", "budgetMinutes", "clientId", "closedAt", "complianceTypeCode", "createdAt", "createdById", "directorId", "effectiveDueDate", "engagementId", "filedById", "filedDate", "gstinId", "id", "isOneOff", "isProvisional", "notApplicableReason", "originalDueDate", "partyKey", "pendingFromClient", "pendingSince", "periodKey", "periodLabel", "signoffRecorded", "stageIndex", "stageTemplateVersionId", "status", "supersededByTaskId", "title", "udinRecordId", "underReview", "updatedAt", "updatedById") SELECT "ackNumber", "ackType", "amendsTaskId", "budgetMinutes", "clientId", "closedAt", "complianceTypeCode", "createdAt", "createdById", "directorId", "effectiveDueDate", "engagementId", "filedById", "filedDate", "gstinId", "id", "isOneOff", "isProvisional", "notApplicableReason", "originalDueDate", "partyKey", "pendingFromClient", "pendingSince", "periodKey", "periodLabel", "signoffRecorded", "stageIndex", "stageTemplateVersionId", "status", "supersededByTaskId", "title", "udinRecordId", "underReview", "updatedAt", "updatedById" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_engagementId_idx" ON "Task"("engagementId");
CREATE INDEX "Task_clientId_status_idx" ON "Task"("clientId", "status");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_effectiveDueDate_idx" ON "Task"("effectiveDueDate");
CREATE UNIQUE INDEX "Task_clientId_complianceTypeCode_partyKey_periodKey_key" ON "Task"("clientId", "complianceTypeCode", "partyKey", "periodKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
