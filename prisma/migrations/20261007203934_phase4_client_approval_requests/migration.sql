-- CreateTable
CREATE TABLE "ClientApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvalId" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateIndex
CREATE INDEX "ClientApprovalRequest_clientId_status_idx" ON "ClientApprovalRequest"("clientId", "status");

-- CreateIndex
CREATE INDEX "ClientApprovalRequest_taskId_idx" ON "ClientApprovalRequest"("taskId");
