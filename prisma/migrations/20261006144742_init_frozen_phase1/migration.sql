-- CreateTable
CREATE TABLE "FirmProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "stateCode" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT NOT NULL DEFAULT '',
    "pan" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccount" TEXT NOT NULL DEFAULT '',
    "bankIfsc" TEXT NOT NULL DEFAULT '',
    "upiId" TEXT NOT NULL DEFAULT '',
    "invoiceNote" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "InvoiceSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fy" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT,
    "seriesId" TEXT,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "date" TEXT NOT NULL,
    "dueDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "placeOfSupply" TEXT NOT NULL DEFAULT '',
    "taxablePaise" INTEGER NOT NULL DEFAULT 0,
    "cgstPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstPaise" INTEGER NOT NULL DEFAULT 0,
    "igstPaise" INTEGER NOT NULL DEFAULT 0,
    "reimbursementPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL DEFAULT 0,
    "receivedPaise" INTEGER NOT NULL DEFAULT 0,
    "writtenOffPaise" INTEGER NOT NULL DEFAULT 0,
    "irn" TEXT,
    "pdfDocumentId" TEXT,
    "isRetainerDraft" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "raisedById" TEXT,
    "raisedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FEE',
    "description" TEXT NOT NULL,
    "sac" TEXT NOT NULL DEFAULT '',
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "ratePaise" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "gstRateBp" INTEGER NOT NULL DEFAULT 0,
    "engagementId" TEXT,
    "disbursementId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ReceiptAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ReceiptAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReceiptAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WriteOff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "WriteOff_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Disbursement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "date" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "paidBy" TEXT NOT NULL DEFAULT 'FIRM',
    "receiptDocumentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNRECOVERED',
    "invoiceLineId" TEXT,
    "expenseClaimId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL DEFAULT 'OTHER',
    "contactName" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "phone" TEXT,
    "pan" TEXT,
    "gstin" TEXT,
    "servicesCsv" TEXT NOT NULL DEFAULT '',
    "estFeePaise" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'OTHER',
    "referrerClientId" TEXT,
    "referrerName" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "lostReason" TEXT,
    "nextFollowUp" TEXT,
    "clientId" TEXT,
    "wonAt" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT,
    "clientId" TEXT,
    "engagementId" TEXT,
    "kind" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "byUserId" TEXT NOT NULL,
    "nextFollowUp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceLine" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "deliverables" TEXT NOT NULL DEFAULT '',
    "timelines" TEXT NOT NULL DEFAULT '',
    "feeBasis" TEXT NOT NULL DEFAULT 'FIXED',
    "defaultFeePaise" INTEGER NOT NULL DEFAULT 0,
    "oopTerms" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT,
    "clientId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "serviceLine" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "deliverables" TEXT NOT NULL DEFAULT '',
    "timelines" TEXT NOT NULL DEFAULT '',
    "feeBasis" TEXT NOT NULL DEFAULT 'FIXED',
    "feePaise" INTEGER NOT NULL DEFAULT 0,
    "ratePaise" INTEGER NOT NULL DEFAULT 0,
    "budgetMinutes" INTEGER NOT NULL DEFAULT 0,
    "oopTerms" TEXT NOT NULL DEFAULT '',
    "gstRateBp" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "sentAt" DATETIME,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Proposal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngagementLetter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT,
    "clientId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" DATETIME,
    "acceptedByPortalUserId" TEXT,
    "acceptedAt" DATETIME,
    "acceptedIp" TEXT,
    "signedCopyDocumentId" TEXT,
    "pdfDocumentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "OnboardingChecklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "OnboardingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checklistId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "doneById" TEXT,
    "documentId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "OnboardingItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "OnboardingChecklist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConflictCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "leadId" TEXT,
    "checkedById" TEXT NOT NULL,
    "matchesText" TEXT NOT NULL DEFAULT '',
    "partnerDecision" TEXT,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "serviceLine" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "leadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Renewal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "lastFeePaise" INTEGER NOT NULL DEFAULT 0,
    "lastMinutes" INTEGER NOT NULL DEFAULT 0,
    "suggestedFeePaise" INTEGER NOT NULL DEFAULT 0,
    "approvedFeePaise" INTEGER,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "letterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "portalUserId" TEXT,
    "rating" INTEGER,
    "comment" TEXT NOT NULL DEFAULT '',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" DATETIME,
    "alertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "segmentJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "markedSentAt" DATETIME,
    "markedSentById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageTemplateFamily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stageTemplateCode" TEXT NOT NULL,
    "checklistTemplateCode" TEXT,
    "reviewLevel" TEXT NOT NULL DEFAULT 'MANAGER',
    "requiresSignoff" BOOLEAN NOT NULL DEFAULT false,
    "requiresUdin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ComplianceType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "periodBasis" TEXT NOT NULL,
    "partyBasis" TEXT NOT NULL DEFAULT 'CLIENT',
    "familyCode" TEXT NOT NULL,
    "serviceLine" TEXT NOT NULL,
    "ackType" TEXT NOT NULL DEFAULT 'ARN',
    "weekendHolidayPolicy" TEXT NOT NULL DEFAULT 'NONE',
    "eventTypeCode" TEXT,
    "appliesWhen" TEXT NOT NULL DEFAULT '',
    "isFirmOnly" BOOLEAN NOT NULL DEFAULT false,
    "isClosure" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "DueDateRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "complianceTypeCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "paramsJson" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT '',
    "notificationRef" TEXT NOT NULL DEFAULT '',
    "knowledgeArticleId" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "DueDateRule_complianceTypeCode_fkey" FOREIGN KEY ("complianceTypeCode") REFERENCES "ComplianceType" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LateFeeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "complianceTypeCode" TEXT NOT NULL,
    "perDayPaise" INTEGER NOT NULL DEFAULT 0,
    "maxPaise" INTEGER,
    "interestBpPerMonth" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "LateFeeRate_complianceTypeCode_fkey" FOREIGN KEY ("complianceTypeCode") REFERENCES "ComplianceType" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicabilityFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "appliesWhen" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT 'CLIENT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ApplicabilityRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "complianceTypeCode" TEXT NOT NULL,
    "conditionJson" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "EventDate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "eventTypeCode" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL DEFAULT '-',
    "partyKey" TEXT NOT NULL DEFAULT '-',
    "dateValue" TEXT NOT NULL,
    "isProvisional" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "EventDate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientComplianceSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "complianceTypeCode" TEXT NOT NULL,
    "partyKey" TEXT NOT NULL DEFAULT '-',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "endReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ClientComplianceSubscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Extension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "periodsMode" TEXT NOT NULL DEFAULT 'SPECIFIC',
    "periodKeys" TEXT NOT NULL DEFAULT '',
    "scopeAllClients" BOOLEAN NOT NULL DEFAULT true,
    "newEffectiveDueDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notificationRef" TEXT NOT NULL DEFAULT '',
    "supersedesId" TEXT,
    "previewCount" INTEGER,
    "publishedAt" DATETIME,
    "publishedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ExtensionType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "extensionId" TEXT NOT NULL,
    "complianceTypeCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ExtensionType_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtensionScope" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "extensionId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "valuesCsv" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ExtensionScope_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NATIONAL',
    "stateCode" TEXT NOT NULL DEFAULT '-',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "GstStateGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stateCode" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "stageIndex" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ReviewPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "reviewRequestId" TEXT,
    "text" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "raisedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "response" TEXT NOT NULL DEFAULT '',
    "clearedById" TEXT,
    "clearedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ReviewPoint_reviewRequestId_fkey" FOREIGN KEY ("reviewRequestId") REFERENCES "ReviewRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignOff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "engagementId" TEXT,
    "level" TEXT NOT NULL,
    "signedById" TEXT NOT NULL,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "udinRecordId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "engagementType" TEXT,
    "complianceTypeCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "keywords" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "taskId" TEXT,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "requestedAt" TEXT,
    "receivedAt" TEXT,
    "receivedPendingConfirm" BOOLEAN NOT NULL DEFAULT false,
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "keywords" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "PendingRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "since" TEXT NOT NULL,
    "clearedAt" DATETIME,
    "clearedById" TEXT,
    "clearedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "PendingRecordItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pendingRecordId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "PendingRecordItem_pendingRecordId_fkey" FOREIGN KEY ("pendingRecordId") REFERENCES "PendingRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "taskId" TEXT,
    "pendingRecordId" TEXT,
    "invoiceId" TEXT,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "messageText" TEXT NOT NULL DEFAULT '',
    "ruleCode" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ClientReminderSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "complianceTypeCode" TEXT,
    "dayOfMonth" INTEGER NOT NULL,
    "monthsCsv" TEXT NOT NULL DEFAULT '',
    "templateCode" TEXT,
    "messageText" TEXT NOT NULL DEFAULT '',
    "escalateAfter" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ClientReminderDue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT,
    "clientId" TEXT NOT NULL,
    "taskId" TEXT,
    "invoiceId" TEXT,
    "kind" TEXT NOT NULL,
    "dueOn" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "sentAt" DATETIME,
    "sentById" TEXT,
    "reminderLogId" TEXT,
    "sequenceNo" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "ayOrPeriod" TEXT NOT NULL DEFAULT '',
    "noticeType" TEXT NOT NULL DEFAULT '',
    "section" TEXT NOT NULL DEFAULT '',
    "referenceNo" TEXT NOT NULL DEFAULT '',
    "noticeDate" TEXT,
    "receivedDate" TEXT NOT NULL,
    "responseDueDate" TEXT,
    "assigneeId" TEXT,
    "reviewerId" TEXT,
    "engagementId" TEXT,
    "taskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT NOT NULL DEFAULT '',
    "demandPaise" INTEGER NOT NULL DEFAULT 0,
    "demandStatus" TEXT NOT NULL DEFAULT 'NONE',
    "summary" TEXT NOT NULL DEFAULT '',
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Hearing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noticeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'HEARING',
    "notes" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Hearing_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DSC" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holderName" TEXT NOT NULL,
    "holderType" TEXT NOT NULL DEFAULT 'DIRECTOR',
    "directorId" TEXT,
    "dscClass" TEXT NOT NULL DEFAULT 'CLASS_3',
    "dscType" TEXT NOT NULL DEFAULT 'SIGNING',
    "issuer" TEXT NOT NULL DEFAULT '',
    "tokenSerial" TEXT NOT NULL DEFAULT '',
    "issueDate" TEXT,
    "expiryDate" TEXT NOT NULL,
    "custody" TEXT NOT NULL DEFAULT 'OFFICE',
    "location" TEXT NOT NULL DEFAULT '',
    "custodianUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "DSCClient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dscId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "DSCClient_dscId_fkey" FOREIGN KEY ("dscId") REFERENCES "DSC" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DSCMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dscId" TEXT NOT NULL,
    "fromCustody" TEXT NOT NULL,
    "toCustody" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "clientId" TEXT,
    "movedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "DSCMovement_dscId_fkey" FOREIGN KEY ("dscId") REFERENCES "DSC" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UDINRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "taskId" TEXT,
    "documentType" TEXT NOT NULL,
    "signingDate" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "udin" TEXT,
    "generatedOn" TEXT,
    "signedDocumentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AWAITING',
    "reconciledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "usernameEnc" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "extraEnc" TEXT,
    "changePeriodically" BOOLEAN NOT NULL DEFAULT false,
    "lastChangedOn" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "CredentialGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "credentialId" TEXT,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "revokedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "CredentialGrant_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CredentialViewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "credentialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT 'PASSWORD',
    "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "CredentialViewLog_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InwardOutward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "documentDesc" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "handledById" TEXT,
    "currentLocation" TEXT NOT NULL DEFAULT '',
    "custodianUserId" TEXT,
    "returnedAt" DATETIME,
    "portalUploadId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL,
    "isSenior" BOOLEAN NOT NULL DEFAULT false,
    "designationId" TEXT,
    "reportingManagerId" TEXT,
    "defaultLocation" TEXT NOT NULL DEFAULT 'OFFICE',
    "locationChangeable" BOOLEAN NOT NULL DEFAULT true,
    "totpSecretEnc" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpEnrolledAt" DATETIME,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "sessionEpoch" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" DATETIME,
    "deactivatedById" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "searchName" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "User_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "portalUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "revokeReason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UserSession_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "realm" TEXT NOT NULL DEFAULT 'STAFF',
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ip" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Designation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "roleHint" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "CostRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "designationId" TEXT NOT NULL,
    "ratePaisePerHour" INTEGER NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "CostRate_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "leadManagerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ClientTeam_leadManagerId_fkey" FOREIGN KEY ("leadManagerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientTeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ClientTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ClientTeam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "gstCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isUT" BOOLEAN NOT NULL DEFAULT false,
    "ptLevied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ClientGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL DEFAULT '',
    "groupId" TEXT,
    "constitution" TEXT NOT NULL,
    "pan" TEXT,
    "tan" TEXT,
    "cinLlpin" TEXT,
    "udyam" TEXT,
    "stateCode" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "incorporationDate" TEXT,
    "fyEnd" TEXT NOT NULL DEFAULT '03-31',
    "booksBy" TEXT NOT NULL DEFAULT 'CLIENT',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "statusEffectiveFrom" TEXT,
    "partnerId" TEXT,
    "managerId" TEXT,
    "teamId" TEXT,
    "category" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "isFirm" BOOLEAN NOT NULL DEFAULT false,
    "publicInterest" BOOLEAN NOT NULL DEFAULT false,
    "leadSource" TEXT,
    "onboardingDate" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preferredChannel" TEXT NOT NULL DEFAULT 'EMAIL',
    "tdsApplicable" BOOLEAN NOT NULL DEFAULT false,
    "tdsSalary" BOOLEAN NOT NULL DEFAULT false,
    "tdsNonSalary" BOOLEAN NOT NULL DEFAULT false,
    "tdsNonResident" BOOLEAN NOT NULL DEFAULT false,
    "tcsApplicable" BOOLEAN NOT NULL DEFAULT false,
    "taxAuditApplicable" BOOLEAN NOT NULL DEFAULT false,
    "transferPricingApplicable" BOOLEAN NOT NULL DEFAULT false,
    "statutoryAuditApplicable" BOOLEAN NOT NULL DEFAULT false,
    "advanceTaxApplicable" BOOLEAN NOT NULL DEFAULT false,
    "pfApplicable" BOOLEAN NOT NULL DEFAULT false,
    "esiApplicable" BOOLEAN NOT NULL DEFAULT false,
    "msmeApplicable" BOOLEAN NOT NULL DEFAULT false,
    "dpt3Applicable" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Client_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ClientGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Client_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Client_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Client_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ClientTeam" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientFlagHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "partyKey" TEXT NOT NULL DEFAULT '-',
    "oldValue" TEXT,
    "newValue" TEXT,
    "effectiveDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ClientFlagHistory_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GSTIN" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "tradeName" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "frequencyEffectiveFrom" TEXT,
    "iffOpted" BOOLEAN NOT NULL DEFAULT false,
    "annualReturnApplicable" BOOLEAN NOT NULL DEFAULT false,
    "gstr9cApplicable" BOOLEAN NOT NULL DEFAULT false,
    "registrationDate" TEXT,
    "cancellationDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "GSTIN_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Director" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "din" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL DEFAULT '',
    "panEnc" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "primaryClientId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Director_primaryClientId_fkey" FOREIGN KEY ("primaryClientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientDirector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "directorId" TEXT NOT NULL,
    "designation" TEXT NOT NULL DEFAULT 'DIRECTOR',
    "appointedOn" TEXT,
    "ceasedOn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ClientDirector_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientDirector_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "Director" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "preferredChannel" TEXT NOT NULL DEFAULT 'EMAIL',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isBilling" BOOLEAN NOT NULL DEFAULT false,
    "birthday" TEXT,
    "optOutCampaigns" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientPtRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EMPLOYER',
    "registrationNo" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ClientPtRegistration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "engagementType" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "StageTemplateVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TEXT NOT NULL,
    "approvedById" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "StageTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StageTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageDef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "reviewLevel" TEXT NOT NULL DEFAULT 'NONE',
    "isClientApproval" BOOLEAN NOT NULL DEFAULT false,
    "isFiling" BOOLEAN NOT NULL DEFAULT false,
    "requiresUdin" BOOLEAN NOT NULL DEFAULT false,
    "requiresDsc" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "StageDef_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "StageTemplateVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromVersionId" TEXT NOT NULL,
    "toVersionId" TEXT NOT NULL,
    "fromStageIndex" INTEGER NOT NULL,
    "toStageIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceLine" TEXT NOT NULL,
    "engagementType" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "complianceTypeCode" TEXT,
    "stageTemplateVersionId" TEXT,
    "feeBasis" TEXT NOT NULL DEFAULT 'FIXED',
    "feePaise" INTEGER NOT NULL DEFAULT 0,
    "ratePaisePerHour" INTEGER NOT NULL DEFAULT 0,
    "budgetMinutes" INTEGER NOT NULL DEFAULT 0,
    "chargeable" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TEXT,
    "endDate" TEXT,
    "partnerId" TEXT,
    "managerId" TEXT,
    "eqrRequired" BOOLEAN NOT NULL DEFAULT false,
    "proposalId" TEXT,
    "engagementLetterId" TEXT,
    "closedAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Engagement_stageTemplateVersionId_fkey" FOREIGN KEY ("stageTemplateVersionId") REFERENCES "StageTemplateVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngagementAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "EngagementAssignment_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EngagementAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngagementBudgetPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "budgetMinutes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "EngagementBudgetPeriod_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
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

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "stageIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "completedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "TaskStage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "TaskStatusHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DueDateHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "DueDateHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Acknowledgment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "ackType" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Acknowledgment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InternalCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chargeable" BOOLEAN NOT NULL DEFAULT false,
    "feedsCpe" BOOLEAN NOT NULL DEFAULT false,
    "linksLead" BOOLEAN NOT NULL DEFAULT false,
    "linksKnowledge" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "DescriptionChip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "WorkEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "clientId" TEXT,
    "engagementId" TEXT,
    "taskId" TEXT,
    "internalCategoryId" TEXT,
    "stageIndex" INTEGER,
    "stageName" TEXT,
    "minutes" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "chips" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT 'OFFICE',
    "clientSiteClientId" TEXT,
    "outcomeType" TEXT,
    "outcomeRef" TEXT,
    "chargeable" BOOLEAN NOT NULL DEFAULT false,
    "leadId" TEXT,
    "knowledgeArticleId" TEXT,
    "clientUuid" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "WorkEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkEntry_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkEntry_internalCategoryId_fkey" FOREIGN KEY ("internalCategoryId") REFERENCES "InternalCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecentPair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL DEFAULT '-',
    "taskId" TEXT NOT NULL DEFAULT '-',
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "WorkTimer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "engagementId" TEXT,
    "taskId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "stoppedAt" DATETIME,
    "workEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "WeeklyLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'FIRM',
    "userId" TEXT,
    "lockAt" DATETIME NOT NULL,
    "lockedAt" DATETIME,
    "extendedUntil" DATETIME,
    "extendedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "CorrectionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workEntryId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decidedAt" DATETIME,
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeCategory" TEXT NOT NULL DEFAULT 'STAFF',
    "dateOfBirth" TEXT,
    "gender" TEXT,
    "personalEmail" TEXT,
    "personalMobile" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "emergencyName" TEXT NOT NULL DEFAULT '',
    "emergencyPhone" TEXT NOT NULL DEFAULT '',
    "bankNameEnc" TEXT,
    "bankAccountEnc" TEXT,
    "bankIfscEnc" TEXT,
    "panEnc" TEXT,
    "aadhaarEnc" TEXT,
    "aadhaarLast4" TEXT,
    "uan" TEXT,
    "esiNumber" TEXT,
    "qualifications" TEXT NOT NULL DEFAULT '',
    "membershipBody" TEXT,
    "membershipNo" TEXT,
    "joiningDate" TEXT,
    "confirmationDate" TEXT,
    "exitDate" TEXT,
    "workStateCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "EmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "clientId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DERIVED',
    "checkInAt" DATETIME,
    "checkInNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Regularisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "requestedStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "employeeCategory" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "quotaHalfDays" INTEGER NOT NULL,
    "accrual" TEXT NOT NULL DEFAULT 'ANNUAL',
    "carryForwardMaxHalfDays" INTEGER NOT NULL DEFAULT 0,
    "encashable" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "openingHalfDays" INTEGER NOT NULL DEFAULT 0,
    "accruedHalfDays" INTEGER NOT NULL DEFAULT 0,
    "takenHalfDays" INTEGER NOT NULL DEFAULT 0,
    "encashedHalfDays" INTEGER NOT NULL DEFAULT 0,
    "adjustedHalfDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "halfDayStart" BOOLEAN NOT NULL DEFAULT false,
    "halfDayEnd" BOOLEAN NOT NULL DEFAULT false,
    "halfDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decidedAt" DATETIME,
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "conflictsReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SALARY',
    "componentsEnc" TEXT NOT NULL,
    "monthlyGrossPaiseEnc" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'NEW',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SALARY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "paidAt" DATETIME,
    "lockedAt" DATETIME,
    "totalsEnc" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "daysInMonth" INTEGER NOT NULL,
    "lopHalfDays" INTEGER NOT NULL DEFAULT 0,
    "linesEnc" TEXT NOT NULL,
    "grossPaiseEnc" TEXT NOT NULL,
    "netPaiseEnc" TEXT NOT NULL,
    "pfPaise" INTEGER NOT NULL DEFAULT 0,
    "esiPaise" INTEGER NOT NULL DEFAULT 0,
    "ptPaise" INTEGER NOT NULL DEFAULT 0,
    "tdsPaise" INTEGER NOT NULL DEFAULT 0,
    "pdfDocumentId" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentDeclaration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'NEW',
    "itemsEnc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "proofsSubmittedAt" DATETIME,
    "verifiedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "InvestmentProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "InvestmentProof_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "InvestmentDeclaration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Form16" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "partADocId" TEXT,
    "pdfDocumentId" TEXT,
    "generatedAt" DATETIME,
    "issuedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "PfRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "effectiveFrom" TEXT NOT NULL,
    "employeeBp" INTEGER NOT NULL,
    "employerEpfBp" INTEGER NOT NULL,
    "employerEpsBp" INTEGER NOT NULL,
    "epsWageCeilingPaise" INTEGER NOT NULL,
    "pfWageCeilingPaise" INTEGER NOT NULL,
    "adminBp" INTEGER NOT NULL DEFAULT 0,
    "edliBp" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "EsiRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "effectiveFrom" TEXT NOT NULL,
    "employeeBp" INTEGER NOT NULL,
    "employerBp" INTEGER NOT NULL,
    "wageCeilingPaise" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ProfessionalTaxSlab" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stateCode" TEXT NOT NULL,
    "fromPaise" INTEGER NOT NULL,
    "toPaise" INTEGER,
    "amountPaise" INTEGER NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'ANY',
    "overrideMonth" INTEGER,
    "overrideAmountPaise" INTEGER,
    "effectiveFrom" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "IncomeTaxSlab" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fy" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "fromPaise" INTEGER NOT NULL,
    "toPaise" INTEGER,
    "rateBp" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "TaxParameter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fy" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'ANY',
    "key" TEXT NOT NULL,
    "valueInt" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PAISE',
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "StipendMinimum" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institute" TEXT NOT NULL,
    "locationClass" TEXT NOT NULL,
    "yearOfTraining" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "CpeRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institute" TEXT NOT NULL,
    "memberClass" TEXT NOT NULL,
    "blockStartYear" INTEGER NOT NULL,
    "blockYears" INTEGER NOT NULL,
    "structuredMinutes" INTEGER NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "perYearMinutes" INTEGER NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ConveyanceRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "ratePaise" INTEGER NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Opening" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'STAFF',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "openedAt" TEXT NOT NULL,
    "closedAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "openingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT 'APPLIED',
    "rejectedReason" TEXT,
    "resumeDocId" TEXT,
    "offerLetterDocId" TEXT,
    "joinedUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Candidate_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "scheduledAt" TEXT NOT NULL,
    "scoreJson" TEXT NOT NULL DEFAULT '{}',
    "recommendation" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Interview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeOnboardingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "doneById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "AppraisalCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ANNUAL',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GOAL_SETTING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "AppraisalReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "managerId" TEXT,
    "partnerId" TEXT,
    "selfReview" TEXT NOT NULL DEFAULT '',
    "selfSubmittedAt" DATETIME,
    "managerReview" TEXT NOT NULL DEFAULT '',
    "managerRating" INTEGER,
    "managerSubmittedAt" DATETIME,
    "moderatedRating" INTEGER,
    "finalRating" INTEGER,
    "incrementRecommendationBp" INTEGER,
    "evidenceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "AppraisalReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "weightPct" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "selfComment" TEXT NOT NULL DEFAULT '',
    "managerComment" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Goal_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AppraisalReview" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CPELog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "structured" BOOLEAN NOT NULL DEFAULT true,
    "provider" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL,
    "certificateDocId" TEXT,
    "workEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serviceLine" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "EmployeeSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "trainer" TEXT NOT NULL DEFAULT '',
    "cpeEligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "TrainingAttendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "distanceKm" INTEGER,
    "clientId" TEXT,
    "workEntryId" TEXT,
    "clientRecoverable" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "receiptDocId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decidedAt" DATETIME,
    "paidVia" TEXT,
    "paidAt" DATETIME,
    "payrollRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "purchaseDate" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuedAt" TEXT NOT NULL,
    "returnedAt" TEXT,
    "conditionOnReturn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExitCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "resignationDate" TEXT NOT NULL,
    "lastWorkingDate" TEXT,
    "noticeDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NOTICE',
    "ffComputedEnc" TEXT,
    "relievingLetterDocId" TEXT,
    "experienceLetterDocId" TEXT,
    "instituteClosureNote" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ExitChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exitCaseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "doneById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ExitChecklistItem_exitCaseId_fkey" FOREIGN KEY ("exitCaseId") REFERENCES "ExitCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "documentId" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" TEXT NOT NULL,
    "requiresAck" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "PolicyAcknowledgment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "PolicyAcknowledgment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PolicyDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArticleshipRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "institute" TEXT NOT NULL DEFAULT 'ICAI',
    "registrationNo" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "expectedEndDate" TEXT NOT NULL,
    "revisedEndDate" TEXT,
    "leaveEntitledDays" INTEGER NOT NULL DEFAULT 0,
    "stipendYear" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "completionDate" TEXT,
    "terminationDate" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ArticleshipNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ArticleshipNote_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ArticleshipRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HRLetter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "documentId" TEXT,
    "issuedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "PortalUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "passwordHash" TEXT,
    "totpSecretEnc" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sessionEpoch" INTEGER NOT NULL DEFAULT 0,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "contactId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "PortalUserClient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portalUserId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "PortalUserClient_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portalUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "PortalInvite_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portalUserId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "taskId" TEXT,
    "checklistItemId" TEXT,
    "documentId" TEXT NOT NULL,
    "autoTag" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "subject" TEXT NOT NULL,
    "lastMessageAt" DATETIME,
    "firstUnansweredAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "MessageThreadParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "removedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "MessageThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorPortalUserId" TEXT,
    "body" TEXT NOT NULL,
    "documentId" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readByClientAt" DATETIME,
    "readByFirmAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "documentId" TEXT,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT,
    "clientId" TEXT,
    "engagementId" TEXT,
    "periodKey" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folderId" TEXT,
    "clientId" TEXT,
    "engagementId" TEXT,
    "taskId" TEXT,
    "employeeUserId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "sourceType" TEXT NOT NULL DEFAULT 'UPLOAD',
    "confidentiality" TEXT NOT NULL DEFAULT 'NORMAL',
    "tagsCsv" TEXT NOT NULL DEFAULT '',
    "sharedWithClient" BOOLEAN NOT NULL DEFAULT false,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "checkedOutById" TEXT,
    "checkedOutAt" DATETIME,
    "auditSectionCode" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedByPortalUserId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentSearchToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "AuditFileSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "QCChecklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completedById" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "QCChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checklistId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "response" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "QCChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "QCChecklist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndependenceDeclaration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "declaredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "QCInspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "QCInspectionSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "QCInspectionSample_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QCInspection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QCFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionId" TEXT NOT NULL,
    "engagementId" TEXT,
    "finding" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "correctiveAction" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT,
    "dueDate" TEXT,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "QCFinding_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QCInspection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PeerReviewPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "outputFormat" TEXT NOT NULL DEFAULT 'PDF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "mergeFieldsCsv" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "serviceLine" TEXT,
    "sourceRef" TEXT NOT NULL DEFAULT '',
    "tagsCsv" TEXT NOT NULL DEFAULT '',
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "KnowledgeArticleLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "complianceTypeCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "KnowledgeArticleLink_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "editedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Mention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "title" TEXT NOT NULL,
    "scheduledAt" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT NOT NULL DEFAULT '',
    "agenda" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "organizerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "contactId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dueDate" TEXT,
    "taskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ActionItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "portalUserId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT,
    "entityId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dedupeKey" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "quietFrom" TEXT,
    "quietTo" TEXT,
    "browserEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mutedKindsCsv" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "HelpdeskTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "raisedById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "queue" TEXT NOT NULL DEFAULT 'ADMIN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "screenshotDocId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "resolvedAt" DATETIME,
    "closedAt" DATETIME,
    "reopenedCount" INTEGER NOT NULL DEFAULT 0,
    "faqArticleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "TicketReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "TicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HelpdeskTicket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Applause" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toUserId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "badgeCode" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "RetentionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordType" TEXT NOT NULL,
    "retainYears" INTEGER,
    "basis" TEXT NOT NULL DEFAULT '',
    "purgeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT '',
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "PurgeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordType" TEXT NOT NULL,
    "entityIdsJson" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "decidedAt" DATETIME,
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "actorUserId" TEXT,
    "actorPortalUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "lockState" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "SensitiveViewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorPortalUserId" TEXT,
    "kind" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "dataJson" TEXT NOT NULL,
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "ImportRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "restoreRequestedById" TEXT,
    "restoreRequestedAt" DATETIME,
    "restoreApprovedById" TEXT,
    "restoreApprovedAt" DATETIME,
    "restoredAt" DATETIME,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobCode" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "triggeredById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSeries_fy_prefix_key" ON "InvoiceSeries"("fy", "prefix");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Receipt_clientId_idx" ON "Receipt"("clientId");

-- CreateIndex
CREATE INDEX "Disbursement_clientId_status_idx" ON "Disbursement"("clientId", "status");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");

-- CreateIndex
CREATE INDEX "Activity_leadId_idx" ON "Activity"("leadId");

-- CreateIndex
CREATE INDEX "Activity_clientId_idx" ON "Activity"("clientId");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE INDEX "EngagementLetter_clientId_idx" ON "EngagementLetter"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingChecklist_clientId_key" ON "OnboardingChecklist"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingItem_checklistId_code_key" ON "OnboardingItem"("checklistId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_clientId_ruleCode_key" ON "Opportunity"("clientId", "ruleCode");

-- CreateIndex
CREATE UNIQUE INDEX "Renewal_engagementId_periodKey_key" ON "Renewal"("engagementId", "periodKey");

-- CreateIndex
CREATE INDEX "Feedback_clientId_idx" ON "Feedback"("clientId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_idx" ON "CampaignRecipient"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "StageTemplateFamily_code_key" ON "StageTemplateFamily"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceType_code_key" ON "ComplianceType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DueDateRule_complianceTypeCode_version_key" ON "DueDateRule"("complianceTypeCode", "version");

-- CreateIndex
CREATE INDEX "LateFeeRate_complianceTypeCode_effectiveFrom_idx" ON "LateFeeRate"("complianceTypeCode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicabilityFlag_code_key" ON "ApplicabilityFlag"("code");

-- CreateIndex
CREATE INDEX "ApplicabilityRule_complianceTypeCode_idx" ON "ApplicabilityRule"("complianceTypeCode");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_code_key" ON "EventType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EventDate_clientId_eventTypeCode_periodKey_partyKey_key" ON "EventDate"("clientId", "eventTypeCode", "periodKey", "partyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClientComplianceSubscription_clientId_complianceTypeCode_partyKey_key" ON "ClientComplianceSubscription"("clientId", "complianceTypeCode", "partyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionType_extensionId_complianceTypeCode_key" ON "ExtensionType"("extensionId", "complianceTypeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_stateCode_key" ON "Holiday"("date", "stateCode");

-- CreateIndex
CREATE UNIQUE INDEX "GstStateGroup_stateCode_effectiveFrom_key" ON "GstStateGroup"("stateCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ReviewRequest_taskId_idx" ON "ReviewRequest"("taskId");

-- CreateIndex
CREATE INDEX "ReviewRequest_checkerId_status_idx" ON "ReviewRequest"("checkerId", "status");

-- CreateIndex
CREATE INDEX "ReviewPoint_taskId_status_idx" ON "ReviewPoint"("taskId", "status");

-- CreateIndex
CREATE INDEX "SignOff_taskId_idx" ON "SignOff"("taskId");

-- CreateIndex
CREATE INDEX "SignOff_engagementId_idx" ON "SignOff"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_code_key" ON "ChecklistTemplate"("code");

-- CreateIndex
CREATE INDEX "ChecklistItem_taskId_idx" ON "ChecklistItem"("taskId");

-- CreateIndex
CREATE INDEX "ChecklistItem_engagementId_idx" ON "ChecklistItem"("engagementId");

-- CreateIndex
CREATE INDEX "ChecklistItem_clientId_idx" ON "ChecklistItem"("clientId");

-- CreateIndex
CREATE INDEX "PendingRecord_taskId_idx" ON "PendingRecord"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingRecordItem_pendingRecordId_checklistItemId_key" ON "PendingRecordItem"("pendingRecordId", "checklistItemId");

-- CreateIndex
CREATE INDEX "ReminderLog_clientId_idx" ON "ReminderLog"("clientId");

-- CreateIndex
CREATE INDEX "ReminderLog_taskId_idx" ON "ReminderLog"("taskId");

-- CreateIndex
CREATE INDEX "ReminderLog_invoiceId_idx" ON "ReminderLog"("invoiceId");

-- CreateIndex
CREATE INDEX "ClientReminderDue_status_dueOn_idx" ON "ClientReminderDue"("status", "dueOn");

-- CreateIndex
CREATE INDEX "ClientReminderDue_clientId_idx" ON "ClientReminderDue"("clientId");

-- CreateIndex
CREATE INDEX "Notice_clientId_idx" ON "Notice"("clientId");

-- CreateIndex
CREATE INDEX "Notice_responseDueDate_idx" ON "Notice"("responseDueDate");

-- CreateIndex
CREATE INDEX "DSC_expiryDate_idx" ON "DSC"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "DSCClient_dscId_clientId_key" ON "DSCClient"("dscId", "clientId");

-- CreateIndex
CREATE INDEX "DSCMovement_dscId_idx" ON "DSCMovement"("dscId");

-- CreateIndex
CREATE UNIQUE INDEX "UDINRecord_udin_key" ON "UDINRecord"("udin");

-- CreateIndex
CREATE INDEX "UDINRecord_clientId_idx" ON "UDINRecord"("clientId");

-- CreateIndex
CREATE INDEX "UDINRecord_status_idx" ON "UDINRecord"("status");

-- CreateIndex
CREATE INDEX "Credential_clientId_idx" ON "Credential"("clientId");

-- CreateIndex
CREATE INDEX "CredentialGrant_userId_idx" ON "CredentialGrant"("userId");

-- CreateIndex
CREATE INDEX "CredentialGrant_clientId_idx" ON "CredentialGrant"("clientId");

-- CreateIndex
CREATE INDEX "CredentialViewLog_credentialId_idx" ON "CredentialViewLog"("credentialId");

-- CreateIndex
CREATE INDEX "InwardOutward_clientId_idx" ON "InwardOutward"("clientId");

-- CreateIndex
CREATE INDEX "InwardOutward_custodianUserId_idx" ON "InwardOutward"("custodianUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_active_idx" ON "User"("active");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_portalUserId_idx" ON "UserSession"("portalUserId");

-- CreateIndex
CREATE INDEX "LoginAttempt_username_at_idx" ON "LoginAttempt"("username", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Designation_name_key" ON "Designation"("name");

-- CreateIndex
CREATE INDEX "CostRate_designationId_effectiveFrom_idx" ON "CostRate"("designationId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ClientTeam_name_key" ON "ClientTeam"("name");

-- CreateIndex
CREATE INDEX "ClientTeamMember_userId_idx" ON "ClientTeamMember"("userId");

-- CreateIndex
CREATE INDEX "ClientTeamMember_teamId_idx" ON "ClientTeamMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "State_code_key" ON "State"("code");

-- CreateIndex
CREATE UNIQUE INDEX "State_gstCode_key" ON "State"("gstCode");

-- CreateIndex
CREATE UNIQUE INDEX "ClientGroup_code_key" ON "ClientGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE INDEX "Client_groupId_idx" ON "Client"("groupId");

-- CreateIndex
CREATE INDEX "Client_partnerId_idx" ON "Client"("partnerId");

-- CreateIndex
CREATE INDEX "Client_managerId_idx" ON "Client"("managerId");

-- CreateIndex
CREATE INDEX "Client_teamId_idx" ON "Client"("teamId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_searchName_idx" ON "Client"("searchName");

-- CreateIndex
CREATE INDEX "ClientFlagHistory_clientId_flag_idx" ON "ClientFlagHistory"("clientId", "flag");

-- CreateIndex
CREATE UNIQUE INDEX "GSTIN_gstin_key" ON "GSTIN"("gstin");

-- CreateIndex
CREATE INDEX "GSTIN_clientId_idx" ON "GSTIN"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Director_din_key" ON "Director"("din");

-- CreateIndex
CREATE UNIQUE INDEX "ClientDirector_clientId_directorId_key" ON "ClientDirector"("clientId", "directorId");

-- CreateIndex
CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPtRegistration_clientId_stateCode_kind_key" ON "ClientPtRegistration"("clientId", "stateCode", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "StageTemplate_code_key" ON "StageTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StageTemplateVersion_templateId_version_key" ON "StageTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "StageDef_versionId_index_key" ON "StageDef"("versionId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "StageMapping_fromVersionId_toVersionId_fromStageIndex_key" ON "StageMapping"("fromVersionId", "toVersionId", "fromStageIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_code_key" ON "Engagement"("code");

-- CreateIndex
CREATE INDEX "Engagement_clientId_idx" ON "Engagement"("clientId");

-- CreateIndex
CREATE INDEX "Engagement_status_idx" ON "Engagement"("status");

-- CreateIndex
CREATE INDEX "EngagementAssignment_userId_idx" ON "EngagementAssignment"("userId");

-- CreateIndex
CREATE INDEX "EngagementAssignment_engagementId_idx" ON "EngagementAssignment"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementBudgetPeriod_engagementId_periodKey_key" ON "EngagementBudgetPeriod"("engagementId", "periodKey");

-- CreateIndex
CREATE INDEX "Task_engagementId_idx" ON "Task"("engagementId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_effectiveDueDate_idx" ON "Task"("effectiveDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Task_clientId_complianceTypeCode_partyKey_periodKey_key" ON "Task"("clientId", "complianceTypeCode", "partyKey", "periodKey");

-- CreateIndex
CREATE INDEX "TaskAssignment_userId_idx" ON "TaskAssignment"("userId");

-- CreateIndex
CREATE INDEX "TaskAssignment_taskId_idx" ON "TaskAssignment"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStage_taskId_stageIndex_key" ON "TaskStage"("taskId", "stageIndex");

-- CreateIndex
CREATE INDEX "TaskStatusHistory_taskId_idx" ON "TaskStatusHistory"("taskId");

-- CreateIndex
CREATE INDEX "DueDateHistory_taskId_idx" ON "DueDateHistory"("taskId");

-- CreateIndex
CREATE INDEX "Acknowledgment_taskId_idx" ON "Acknowledgment"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalCategory_code_key" ON "InternalCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DescriptionChip_label_key" ON "DescriptionChip"("label");

-- CreateIndex
CREATE UNIQUE INDEX "WorkEntry_clientUuid_key" ON "WorkEntry"("clientUuid");

-- CreateIndex
CREATE INDEX "WorkEntry_userId_date_idx" ON "WorkEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "WorkEntry_clientId_idx" ON "WorkEntry"("clientId");

-- CreateIndex
CREATE INDEX "WorkEntry_engagementId_idx" ON "WorkEntry"("engagementId");

-- CreateIndex
CREATE INDEX "WorkEntry_taskId_idx" ON "WorkEntry"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "RecentPair_userId_clientId_engagementId_taskId_key" ON "RecentPair"("userId", "clientId", "engagementId", "taskId");

-- CreateIndex
CREATE INDEX "WorkTimer_userId_idx" ON "WorkTimer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyLock_weekStart_scope_userId_key" ON "WeeklyLock"("weekStart", "scope", "userId");

-- CreateIndex
CREATE INDEX "CorrectionRequest_workEntryId_idx" ON "CorrectionRequest"("workEntryId");

-- CreateIndex
CREATE INDEX "CorrectionRequest_status_idx" ON "CorrectionRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_userId_key" ON "EmployeeProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_employeeCode_key" ON "EmployeeProfile"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");

-- CreateIndex
CREATE INDEX "Regularisation_userId_idx" ON "Regularisation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_userId_leaveType_fy_key" ON "LeaveBalance"("userId", "leaveType", "fy");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_fromDate_idx" ON "LeaveRequest"("userId", "fromDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "SalaryStructure_userId_effectiveFrom_idx" ON "SalaryStructure"("userId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_month_kind_key" ON "PayrollRun"("month", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_runId_userId_key" ON "Payslip"("runId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentDeclaration_userId_fy_key" ON "InvestmentDeclaration"("userId", "fy");

-- CreateIndex
CREATE UNIQUE INDEX "Form16_userId_fy_key" ON "Form16"("userId", "fy");

-- CreateIndex
CREATE INDEX "ProfessionalTaxSlab_stateCode_effectiveFrom_idx" ON "ProfessionalTaxSlab"("stateCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "IncomeTaxSlab_fy_regime_idx" ON "IncomeTaxSlab"("fy", "regime");

-- CreateIndex
CREATE UNIQUE INDEX "TaxParameter_fy_regime_key_key" ON "TaxParameter"("fy", "regime", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeOnboardingItem_userId_code_key" ON "EmployeeOnboardingItem"("userId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AppraisalReview_cycleId_userId_key" ON "AppraisalReview"("cycleId", "userId");

-- CreateIndex
CREATE INDEX "CPELog_userId_date_idx" ON "CPELog"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSkill_userId_skillId_key" ON "EmployeeSkill"("userId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAttendance_sessionId_userId_key" ON "TrainingAttendance"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_userId_idx" ON "ExpenseClaim"("userId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_status_idx" ON "ExpenseClaim"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tag_key" ON "Asset"("tag");

-- CreateIndex
CREATE INDEX "AssetAssignment_userId_idx" ON "AssetAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExitCase_userId_key" ON "ExitCase"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExitChecklistItem_exitCaseId_code_key" ON "ExitChecklistItem"("exitCaseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcknowledgment_policyId_userId_key" ON "PolicyAcknowledgment"("policyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleshipRecord_userId_key" ON "ArticleshipRecord"("userId");

-- CreateIndex
CREATE INDEX "HRLetter_userId_idx" ON "HRLetter"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_email_key" ON "PortalUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUserClient_portalUserId_clientId_key" ON "PortalUserClient"("portalUserId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalInvite_tokenHash_key" ON "PortalInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalUpload_clientId_idx" ON "PortalUpload"("clientId");

-- CreateIndex
CREATE INDEX "MessageThread_clientId_idx" ON "MessageThread"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThreadParticipant_threadId_userId_key" ON "MessageThreadParticipant"("threadId", "userId");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "ClientApproval_taskId_idx" ON "ClientApproval"("taskId");

-- CreateIndex
CREATE INDEX "Folder_clientId_idx" ON "Folder"("clientId");

-- CreateIndex
CREATE INDEX "Folder_engagementId_idx" ON "Folder"("engagementId");

-- CreateIndex
CREATE INDEX "Document_clientId_idx" ON "Document"("clientId");

-- CreateIndex
CREATE INDEX "Document_engagementId_idx" ON "Document"("engagementId");

-- CreateIndex
CREATE INDEX "Document_employeeUserId_idx" ON "Document"("employeeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "DocumentSearchToken_token_idx" ON "DocumentSearchToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSearchToken_documentId_token_key" ON "DocumentSearchToken"("documentId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "AuditFileSection_engagementId_code_key" ON "AuditFileSection"("engagementId", "code");

-- CreateIndex
CREATE INDEX "QCChecklist_engagementId_idx" ON "QCChecklist"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "IndependenceDeclaration_engagementId_userId_key" ON "IndependenceDeclaration"("engagementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "QCInspectionSample_inspectionId_engagementId_key" ON "QCInspectionSample"("inspectionId", "engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_code_key" ON "Template"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "TemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleLink_articleId_complianceTypeCode_key" ON "KnowledgeArticleLink"("articleId", "complianceTypeCode");

-- CreateIndex
CREATE INDEX "Comment_entityType_entityId_idx" ON "Comment"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_portalUserId_readAt_idx" ON "Notification"("portalUserId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskTicket_number_key" ON "HelpdeskTicket"("number");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_status_queue_idx" ON "HelpdeskTicket"("status", "queue");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");

-- CreateIndex
CREATE INDEX "Applause_toUserId_idx" ON "Applause"("toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionRule_recordType_key" ON "RetentionRule"("recordType");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_at_idx" ON "AuditLog"("actorUserId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "SensitiveViewLog_actorUserId_at_idx" ON "SensitiveViewLog"("actorUserId", "at");

-- CreateIndex
CREATE INDEX "SensitiveViewLog_entityType_entityId_idx" ON "SensitiveViewLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ImportRow_jobId_idx" ON "ImportRow"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BackupRecord_fileName_key" ON "BackupRecord"("fileName");

-- CreateIndex
CREATE INDEX "JobRun_jobCode_startedAt_idx" ON "JobRun"("jobCode", "startedAt");
