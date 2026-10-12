-- CreateTable
CREATE TABLE `FirmProfile` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `address` TEXT NOT NULL DEFAULT '',
    `stateCode` TEXT NOT NULL DEFAULT '',
    `gstin` TEXT NOT NULL DEFAULT '',
    `pan` TEXT NOT NULL DEFAULT '',
    `email` TEXT NOT NULL DEFAULT '',
    `phone` TEXT NOT NULL DEFAULT '',
    `bankName` TEXT NOT NULL DEFAULT '',
    `bankAccount` TEXT NOT NULL DEFAULT '',
    `bankIfsc` TEXT NOT NULL DEFAULT '',
    `upiId` TEXT NOT NULL DEFAULT '',
    `invoiceNote` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceSeries` (
    `id` VARCHAR(191) NOT NULL,
    `fy` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `nextNumber` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `InvoiceSeries_fy_prefix_key`(`fy`, `prefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NULL,
    `seriesId` TEXT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NULL,
    `date` VARCHAR(191) NOT NULL,
    `dueDate` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `placeOfSupply` TEXT NOT NULL DEFAULT '',
    `taxablePaise` INTEGER NOT NULL DEFAULT 0,
    `cgstPaise` INTEGER NOT NULL DEFAULT 0,
    `sgstPaise` INTEGER NOT NULL DEFAULT 0,
    `igstPaise` INTEGER NOT NULL DEFAULT 0,
    `reimbursementPaise` INTEGER NOT NULL DEFAULT 0,
    `totalPaise` INTEGER NOT NULL DEFAULT 0,
    `receivedPaise` INTEGER NOT NULL DEFAULT 0,
    `writtenOffPaise` INTEGER NOT NULL DEFAULT 0,
    `irn` TEXT NULL,
    `recipientGstin` TEXT NULL,
    `ackNo` TEXT NULL,
    `ackDate` TEXT NULL,
    `cancelReason` TEXT NULL,
    `retainerPeriod` TEXT NULL,
    `periodFrom` TEXT NULL,
    `periodTo` TEXT NULL,
    `pdfDocumentId` TEXT NULL,
    `isRetainerDraft` BOOLEAN NOT NULL DEFAULT false,
    `approvedById` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `raisedById` TEXT NULL,
    `raisedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Invoice_number_key`(`number`),
    INDEX `Invoice_clientId_idx`(`clientId`),
    INDEX `Invoice_status_idx`(`status`),
    INDEX `Invoice_engagementId_idx`(`engagementId`),
    INDEX `Invoice_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceLine` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `kind` TEXT NOT NULL DEFAULT 'FEE',
    `description` TEXT NOT NULL,
    `sac` TEXT NOT NULL DEFAULT '',
    `quantityMilli` INTEGER NOT NULL DEFAULT 1000,
    `ratePaise` INTEGER NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `gstRateBp` INTEGER NOT NULL DEFAULT 0,
    `engagementId` VARCHAR(191) NULL,
    `disbursementId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `InvoiceLine_invoiceId_idx`(`invoiceId`),
    INDEX `InvoiceLine_engagementId_idx`(`engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Receipt` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `date` TEXT NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `mode` TEXT NOT NULL,
    `reference` TEXT NOT NULL DEFAULT '',
    `tdsPaise` INTEGER NOT NULL DEFAULT 0,
    `reversedAt` TEXT NULL,
    `reversedReason` TEXT NULL,
    `reversedById` TEXT NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Receipt_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReceiptAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `receiptId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ReceiptAllocation_invoiceId_idx`(`invoiceId`),
    INDEX `ReceiptAllocation_receiptId_idx`(`receiptId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WriteOff` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'PENDING',
    `requestedById` TEXT NOT NULL,
    `approvedById` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Disbursement` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `engagementId` TEXT NULL,
    `date` TEXT NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `kind` TEXT NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `paidBy` TEXT NOT NULL DEFAULT 'FIRM',
    `receiptDocumentId` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UNRECOVERED',
    `invoiceLineId` TEXT NULL,
    `expenseClaimId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Disbursement_clientId_status_idx`(`clientId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lead` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `searchName` TEXT NOT NULL DEFAULT '',
    `entityType` TEXT NOT NULL DEFAULT 'OTHER',
    `contactName` TEXT NOT NULL DEFAULT '',
    `email` TEXT NULL,
    `phone` TEXT NULL,
    `pan` TEXT NULL,
    `gstin` TEXT NULL,
    `servicesCsv` TEXT NOT NULL DEFAULT '',
    `estFeePaise` INTEGER NOT NULL DEFAULT 0,
    `source` TEXT NOT NULL DEFAULT 'OTHER',
    `referrerClientId` TEXT NULL,
    `referrerName` TEXT NOT NULL DEFAULT '',
    `ownerId` VARCHAR(191) NULL,
    `stage` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `lostReason` TEXT NULL,
    `nextFollowUp` TEXT NULL,
    `clientId` TEXT NULL,
    `wonAt` DATETIME(3) NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Lead_stage_idx`(`stage`),
    INDEX `Lead_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Activity` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `engagementId` TEXT NULL,
    `kind` TEXT NOT NULL,
    `date` TEXT NOT NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `byUserId` TEXT NOT NULL,
    `nextFollowUp` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Activity_leadId_idx`(`leadId`),
    INDEX `Activity_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `serviceLine` TEXT NOT NULL,
    `name` TEXT NOT NULL,
    `scope` TEXT NOT NULL DEFAULT '',
    `deliverables` TEXT NOT NULL DEFAULT '',
    `timelines` TEXT NOT NULL DEFAULT '',
    `feeBasis` TEXT NOT NULL DEFAULT 'FIXED',
    `engagementType` TEXT NULL,
    `budgetMinutes` INTEGER NOT NULL DEFAULT 0,
    `defaultFeePaise` INTEGER NOT NULL DEFAULT 0,
    `oopTerms` TEXT NOT NULL DEFAULT '',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Proposal` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `clientId` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `serviceTemplateId` TEXT NULL,
    `parentId` TEXT NULL,
    `title` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `serviceLine` TEXT NOT NULL,
    `scope` TEXT NOT NULL DEFAULT '',
    `deliverables` TEXT NOT NULL DEFAULT '',
    `timelines` TEXT NOT NULL DEFAULT '',
    `feeBasis` TEXT NOT NULL DEFAULT 'FIXED',
    `feePaise` INTEGER NOT NULL DEFAULT 0,
    `ratePaise` INTEGER NOT NULL DEFAULT 0,
    `budgetMinutes` INTEGER NOT NULL DEFAULT 0,
    `oopTerms` TEXT NOT NULL DEFAULT '',
    `gstRateBp` INTEGER NOT NULL DEFAULT 0,
    `validUntil` TEXT NULL,
    `approvedById` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Proposal_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EngagementLetter` (
    `id` VARCHAR(191) NOT NULL,
    `proposalId` TEXT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `leadId` TEXT NULL,
    `templateVersionId` TEXT NULL,
    `body` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'DRAFT',
    `issuedAt` DATETIME(3) NULL,
    `acceptedByPortalUserId` TEXT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `acceptedIp` TEXT NULL,
    `signedCopyDocumentId` TEXT NULL,
    `pdfDocumentId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `EngagementLetter_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingChecklist` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `OnboardingChecklist_clientId_key`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingItem` (
    `id` VARCHAR(191) NOT NULL,
    `checklistId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` TEXT NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneAt` DATETIME(3) NULL,
    `doneById` TEXT NULL,
    `documentId` TEXT NULL,
    `note` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `OnboardingItem_checklistId_code_key`(`checklistId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConflictCheck` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` TEXT NULL,
    `leadId` TEXT NULL,
    `checkedById` TEXT NOT NULL,
    `matchesText` TEXT NOT NULL DEFAULT '',
    `partnerDecision` TEXT NULL,
    `decidedById` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Opportunity` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `ruleCode` VARCHAR(191) NOT NULL,
    `serviceLine` TEXT NOT NULL,
    `description` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'OPEN',
    `leadId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Opportunity_clientId_ruleCode_key`(`clientId`, `ruleCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Renewal` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `periodKey` VARCHAR(191) NOT NULL,
    `dueDate` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'DUE',
    `lastFeePaise` INTEGER NOT NULL DEFAULT 0,
    `lastMinutes` INTEGER NOT NULL DEFAULT 0,
    `suggestedFeePaise` INTEGER NOT NULL DEFAULT 0,
    `approvedFeePaise` INTEGER NULL,
    `approvedById` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `letterId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Renewal_engagementId_periodKey_key`(`engagementId`, `periodKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Feedback` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` TEXT NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `portalUserId` TEXT NULL,
    `rating` INTEGER NULL,
    `comment` TEXT NOT NULL DEFAULT '',
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `receivedAt` DATETIME(3) NULL,
    `alertedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Feedback_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Campaign` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `messageText` TEXT NOT NULL,
    `segmentJson` TEXT NOT NULL DEFAULT '{}',
    `status` TEXT NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignRecipient` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `clientId` TEXT NOT NULL,
    `contactId` TEXT NULL,
    `channel` TEXT NOT NULL DEFAULT 'WHATSAPP',
    `markedSentAt` DATETIME(3) NULL,
    `markedSentById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `CampaignRecipient_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StageTemplateFamily` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `stageTemplateCode` TEXT NOT NULL,
    `checklistTemplateCode` TEXT NULL,
    `reviewLevel` TEXT NOT NULL DEFAULT 'MANAGER',
    `requiresSignoff` BOOLEAN NOT NULL DEFAULT false,
    `requiresUdin` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `StageTemplateFamily_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComplianceType` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `shortName` TEXT NOT NULL,
    `frequency` TEXT NOT NULL,
    `periodBasis` TEXT NOT NULL,
    `partyBasis` TEXT NOT NULL DEFAULT 'CLIENT',
    `familyCode` TEXT NOT NULL,
    `serviceLine` TEXT NOT NULL,
    `ackType` TEXT NOT NULL DEFAULT 'ARN',
    `weekendHolidayPolicy` TEXT NOT NULL DEFAULT 'NONE',
    `eventTypeCode` TEXT NULL,
    `appliesWhen` TEXT NOT NULL DEFAULT '',
    `isFirmOnly` BOOLEAN NOT NULL DEFAULT false,
    `isClosure` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ComplianceType_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DueDateRule` (
    `id` VARCHAR(191) NOT NULL,
    `complianceTypeCode` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `kind` TEXT NOT NULL,
    `paramsJson` TEXT NOT NULL,
    `effectiveFrom` TEXT NOT NULL,
    `effectiveTo` TEXT NULL,
    `status` TEXT NOT NULL DEFAULT 'ACTIVE',
    `source` TEXT NOT NULL DEFAULT '',
    `notificationRef` TEXT NOT NULL DEFAULT '',
    `knowledgeArticleId` TEXT NULL,
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `DueDateRule_complianceTypeCode_version_key`(`complianceTypeCode`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LateFeeRate` (
    `id` VARCHAR(191) NOT NULL,
    `complianceTypeCode` VARCHAR(191) NOT NULL,
    `perDayPaise` INTEGER NOT NULL DEFAULT 0,
    `maxPaise` INTEGER NULL,
    `interestBpPerMonth` INTEGER NOT NULL DEFAULT 0,
    `note` TEXT NOT NULL DEFAULT '',
    `effectiveFrom` VARCHAR(191) NOT NULL,
    `effectiveTo` TEXT NULL,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `LateFeeRate_complianceTypeCode_effectiveFrom_idx`(`complianceTypeCode`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicabilityFlag` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` TEXT NOT NULL,
    `appliesWhen` TEXT NOT NULL DEFAULT '',
    `scope` TEXT NOT NULL DEFAULT 'CLIENT',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ApplicabilityFlag_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicabilityRule` (
    `id` VARCHAR(191) NOT NULL,
    `complianceTypeCode` VARCHAR(191) NOT NULL,
    `conditionJson` TEXT NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `effectiveFrom` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ApplicabilityRule_complianceTypeCode_idx`(`complianceTypeCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventType` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `EventType_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventDate` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `eventTypeCode` VARCHAR(191) NOT NULL,
    `periodKey` VARCHAR(191) NOT NULL DEFAULT '-',
    `partyKey` VARCHAR(191) NOT NULL DEFAULT '-',
    `dateValue` TEXT NOT NULL,
    `isProvisional` BOOLEAN NOT NULL DEFAULT false,
    `source` TEXT NOT NULL DEFAULT 'MANUAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `EventDate_clientId_eventTypeCode_periodKey_partyKey_key`(`clientId`, `eventTypeCode`, `periodKey`, `partyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientComplianceSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `complianceTypeCode` VARCHAR(191) NOT NULL,
    `partyKey` VARCHAR(191) NOT NULL DEFAULT '-',
    `startDate` TEXT NOT NULL,
    `endDate` TEXT NULL,
    `endReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ClientComplianceSubscription_clientId_complianceTypeCode_par_key`(`clientId`, `complianceTypeCode`, `partyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Extension` (
    `id` VARCHAR(191) NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'DRAFT',
    `periodsMode` TEXT NOT NULL DEFAULT 'SPECIFIC',
    `periodKeys` TEXT NOT NULL DEFAULT '',
    `scopeAllClients` BOOLEAN NOT NULL DEFAULT true,
    `newEffectiveDueDate` TEXT NOT NULL,
    `reason` TEXT NOT NULL,
    `notificationRef` TEXT NOT NULL DEFAULT '',
    `supersedesId` TEXT NULL,
    `previewCount` INTEGER NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishedById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExtensionType` (
    `id` VARCHAR(191) NOT NULL,
    `extensionId` VARCHAR(191) NOT NULL,
    `complianceTypeCode` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ExtensionType_extensionId_complianceTypeCode_key`(`extensionId`, `complianceTypeCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExtensionScope` (
    `id` VARCHAR(191) NOT NULL,
    `extensionId` VARCHAR(191) NOT NULL,
    `field` TEXT NOT NULL,
    `valuesCsv` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Holiday` (
    `id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `kind` TEXT NOT NULL DEFAULT 'NATIONAL',
    `stateCode` VARCHAR(191) NOT NULL DEFAULT '-',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Holiday_date_stateCode_key`(`date`, `stateCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GstStateGroup` (
    `id` VARCHAR(191) NOT NULL,
    `stateCode` VARCHAR(191) NOT NULL,
    `groupCode` TEXT NOT NULL,
    `effectiveFrom` VARCHAR(191) NOT NULL,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `GstStateGroup_stateCode_effectiveFrom_key`(`stateCode`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewRequest` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `stageIndex` INTEGER NOT NULL,
    `level` TEXT NOT NULL,
    `makerId` TEXT NOT NULL,
    `checkerId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,
    `note` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ReviewRequest_taskId_idx`(`taskId`),
    INDEX `ReviewRequest_checkerId_status_idx`(`checkerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewPoint` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `reviewRequestId` VARCHAR(191) NULL,
    `text` TEXT NOT NULL,
    `raisedById` TEXT NOT NULL,
    `raisedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `response` TEXT NOT NULL DEFAULT '',
    `clearedById` TEXT NULL,
    `clearedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ReviewPoint_taskId_status_idx`(`taskId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SignOff` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `engagementId` VARCHAR(191) NULL,
    `level` TEXT NOT NULL,
    `signedById` TEXT NOT NULL,
    `signedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `udinRecordId` TEXT NULL,
    `note` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `SignOff_taskId_idx`(`taskId`),
    INDEX `SignOff_engagementId_idx`(`engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChecklistTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `engagementType` TEXT NULL,
    `complianceTypeCode` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ChecklistTemplate_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChecklistTemplateItem` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `label` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `keywords` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChecklistItem` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `label` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    `requestedAt` TEXT NULL,
    `receivedAt` TEXT NULL,
    `receivedPendingConfirm` BOOLEAN NOT NULL DEFAULT false,
    `confirmedById` TEXT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `note` TEXT NOT NULL DEFAULT '',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `keywords` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ChecklistItem_taskId_idx`(`taskId`),
    INDEX `ChecklistItem_engagementId_idx`(`engagementId`),
    INDEX `ChecklistItem_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PendingRecord` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `what` TEXT NOT NULL,
    `since` TEXT NOT NULL,
    `clearedAt` DATETIME(3) NULL,
    `clearedById` TEXT NULL,
    `clearedReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `PendingRecord_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PendingRecordItem` (
    `id` VARCHAR(191) NOT NULL,
    `pendingRecordId` VARCHAR(191) NOT NULL,
    `checklistItemId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `PendingRecordItem_pendingRecordId_checklistItemId_key`(`pendingRecordId`, `checklistItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReminderLog` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `pendingRecordId` TEXT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `kind` TEXT NOT NULL,
    `channel` TEXT NOT NULL,
    `messageText` TEXT NOT NULL DEFAULT '',
    `ruleCode` TEXT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ReminderLog_clientId_idx`(`clientId`),
    INDEX `ReminderLog_taskId_idx`(`taskId`),
    INDEX `ReminderLog_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientReminderSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `complianceTypeCode` TEXT NULL,
    `dayOfMonth` INTEGER NOT NULL,
    `monthsCsv` TEXT NOT NULL DEFAULT '',
    `templateCode` TEXT NULL,
    `messageText` TEXT NOT NULL DEFAULT '',
    `escalateAfter` INTEGER NOT NULL DEFAULT 3,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientReminderDue` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` TEXT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `taskId` TEXT NULL,
    `invoiceId` TEXT NULL,
    `kind` TEXT NOT NULL,
    `dueOn` VARCHAR(191) NOT NULL,
    `messageText` TEXT NOT NULL,
    `channel` TEXT NOT NULL DEFAULT 'WHATSAPP',
    `status` VARCHAR(191) NOT NULL DEFAULT 'DUE',
    `sentAt` DATETIME(3) NULL,
    `sentById` TEXT NULL,
    `reminderLogId` TEXT NULL,
    `sequenceNo` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ClientReminderDue_status_dueOn_idx`(`status`, `dueOn`),
    INDEX `ClientReminderDue_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notice` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `authority` TEXT NOT NULL,
    `ayOrPeriod` TEXT NOT NULL DEFAULT '',
    `noticeType` TEXT NOT NULL DEFAULT '',
    `section` TEXT NOT NULL DEFAULT '',
    `referenceNo` TEXT NOT NULL DEFAULT '',
    `noticeDate` TEXT NULL,
    `receivedDate` TEXT NOT NULL,
    `responseDueDate` VARCHAR(191) NULL,
    `assigneeId` TEXT NULL,
    `reviewerId` TEXT NULL,
    `engagementId` TEXT NULL,
    `taskId` TEXT NULL,
    `status` TEXT NOT NULL DEFAULT 'OPEN',
    `outcome` TEXT NOT NULL DEFAULT '',
    `demandPaise` INTEGER NOT NULL DEFAULT 0,
    `demandStatus` TEXT NOT NULL DEFAULT 'NONE',
    `summary` TEXT NOT NULL DEFAULT '',
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Notice_clientId_idx`(`clientId`),
    INDEX `Notice_responseDueDate_idx`(`responseDueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Hearing` (
    `id` VARCHAR(191) NOT NULL,
    `noticeId` VARCHAR(191) NOT NULL,
    `date` TEXT NOT NULL,
    `kind` TEXT NOT NULL DEFAULT 'HEARING',
    `notes` TEXT NOT NULL DEFAULT '',
    `outcome` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DSC` (
    `id` VARCHAR(191) NOT NULL,
    `holderName` TEXT NOT NULL,
    `holderType` TEXT NOT NULL DEFAULT 'DIRECTOR',
    `directorId` TEXT NULL,
    `dscClass` TEXT NOT NULL DEFAULT 'CLASS_3',
    `dscType` TEXT NOT NULL DEFAULT 'SIGNING',
    `issuer` TEXT NOT NULL DEFAULT '',
    `tokenSerial` TEXT NOT NULL DEFAULT '',
    `issueDate` TEXT NULL,
    `expiryDate` VARCHAR(191) NOT NULL,
    `custody` TEXT NOT NULL DEFAULT 'OFFICE',
    `location` TEXT NOT NULL DEFAULT '',
    `custodianUserId` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `DSC_expiryDate_idx`(`expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DSCClient` (
    `id` VARCHAR(191) NOT NULL,
    `dscId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `DSCClient_dscId_clientId_key`(`dscId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DSCMovement` (
    `id` VARCHAR(191) NOT NULL,
    `dscId` VARCHAR(191) NOT NULL,
    `fromCustody` TEXT NOT NULL,
    `toCustody` TEXT NOT NULL,
    `location` TEXT NOT NULL DEFAULT '',
    `userId` TEXT NULL,
    `clientId` TEXT NULL,
    `movedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `DSCMovement_dscId_idx`(`dscId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UDINRecord` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `engagementId` TEXT NULL,
    `taskId` TEXT NULL,
    `documentType` TEXT NOT NULL,
    `signingDate` TEXT NOT NULL,
    `partnerId` TEXT NOT NULL,
    `udin` VARCHAR(191) NULL,
    `generatedOn` TEXT NULL,
    `signedDocumentId` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'AWAITING',
    `reconciledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `UDINRecord_udin_key`(`udin`),
    INDEX `UDINRecord_clientId_idx`(`clientId`),
    INDEX `UDINRecord_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Credential` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `portal` TEXT NOT NULL,
    `label` TEXT NOT NULL DEFAULT '',
    `usernameEnc` TEXT NOT NULL,
    `passwordEnc` TEXT NOT NULL,
    `extraEnc` TEXT NULL,
    `changePeriodically` BOOLEAN NOT NULL DEFAULT false,
    `lastChangedOn` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Credential_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CredentialGrant` (
    `id` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `grantedById` TEXT NOT NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `CredentialGrant_userId_idx`(`userId`),
    INDEX `CredentialGrant_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CredentialViewLog` (
    `id` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(191) NOT NULL,
    `userId` TEXT NOT NULL,
    `field` TEXT NOT NULL DEFAULT 'PASSWORD',
    `viewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `CredentialViewLog_credentialId_idx`(`credentialId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InwardOutward` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `direction` TEXT NOT NULL,
    `documentDesc` TEXT NOT NULL,
    `date` TEXT NOT NULL,
    `handledById` TEXT NULL,
    `currentLocation` TEXT NOT NULL DEFAULT '',
    `custodianUserId` VARCHAR(191) NULL,
    `returnedAt` DATETIME(3) NULL,
    `portalUploadId` TEXT NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `InwardOutward_clientId_idx`(`clientId`),
    INDEX `InwardOutward_custodianUserId_idx`(`custodianUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Role_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `displayName` TEXT NOT NULL,
    `email` TEXT NULL,
    `mobile` TEXT NULL,
    `passwordHash` TEXT NOT NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `role` VARCHAR(191) NOT NULL,
    `isSenior` BOOLEAN NOT NULL DEFAULT false,
    `designationId` VARCHAR(191) NULL,
    `reportingManagerId` VARCHAR(191) NULL,
    `defaultLocation` TEXT NOT NULL DEFAULT 'OFFICE',
    `locationChangeable` BOOLEAN NOT NULL DEFAULT true,
    `totpSecretEnc` TEXT NULL,
    `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `totpEnrolledAt` DATETIME(3) NULL,
    `failedLogins` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `sessionEpoch` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `deactivatedAt` DATETIME(3) NULL,
    `deactivatedById` TEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `searchName` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `portalUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokeReason` TEXT NULL,
    `ip` TEXT NULL,
    `userAgent` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `UserSession_userId_idx`(`userId`),
    INDEX `UserSession_portalUserId_idx`(`portalUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoginAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `realm` TEXT NOT NULL DEFAULT 'STAFF',
    `success` BOOLEAN NOT NULL,
    `reason` TEXT NULL,
    `ip` TEXT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `LoginAttempt_username_at_idx`(`username`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Designation` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 0,
    `roleHint` TEXT NOT NULL DEFAULT 'STAFF',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Designation_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CostRate` (
    `id` VARCHAR(191) NOT NULL,
    `designationId` VARCHAR(191) NOT NULL,
    `ratePaisePerHour` INTEGER NOT NULL,
    `effectiveFrom` VARCHAR(191) NOT NULL,
    `effectiveTo` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `CostRate_designationId_effectiveFrom_idx`(`designationId`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientTeam` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `leadManagerId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ClientTeam_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientTeamMember` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fromDate` TEXT NOT NULL,
    `toDate` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ClientTeamMember_userId_idx`(`userId`),
    INDEX `ClientTeamMember_teamId_idx`(`teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `State` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `gstCode` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `isUT` BOOLEAN NOT NULL DEFAULT false,
    `ptLevied` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `State_code_key`(`code`),
    UNIQUE INDEX `State_gstCode_key`(`gstCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientGroup` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `searchName` TEXT NOT NULL DEFAULT '',
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ClientGroup_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `searchName` VARCHAR(191) NOT NULL DEFAULT '',
    `groupId` VARCHAR(191) NULL,
    `constitution` TEXT NOT NULL,
    `pan` TEXT NULL,
    `tan` TEXT NULL,
    `cinLlpin` TEXT NULL,
    `udyam` TEXT NULL,
    `stateCode` TEXT NULL,
    `address` TEXT NOT NULL DEFAULT '',
    `incorporationDate` TEXT NULL,
    `fyEnd` TEXT NOT NULL DEFAULT '03-31',
    `booksBy` TEXT NOT NULL DEFAULT 'CLIENT',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `statusEffectiveFrom` TEXT NULL,
    `partnerId` VARCHAR(191) NULL,
    `managerId` VARCHAR(191) NULL,
    `teamId` VARCHAR(191) NULL,
    `category` TEXT NULL,
    `tags` TEXT NOT NULL DEFAULT '',
    `isFirm` BOOLEAN NOT NULL DEFAULT false,
    `publicInterest` BOOLEAN NOT NULL DEFAULT false,
    `leadSource` TEXT NULL,
    `onboardingDate` TEXT NULL,
    `kycStatus` TEXT NOT NULL DEFAULT 'PENDING',
    `portalEnabled` BOOLEAN NOT NULL DEFAULT false,
    `preferredChannel` TEXT NOT NULL DEFAULT 'EMAIL',
    `tdsApplicable` BOOLEAN NOT NULL DEFAULT false,
    `tdsSalary` BOOLEAN NOT NULL DEFAULT false,
    `tdsNonSalary` BOOLEAN NOT NULL DEFAULT false,
    `tdsNonResident` BOOLEAN NOT NULL DEFAULT false,
    `tcsApplicable` BOOLEAN NOT NULL DEFAULT false,
    `taxAuditApplicable` BOOLEAN NOT NULL DEFAULT false,
    `transferPricingApplicable` BOOLEAN NOT NULL DEFAULT false,
    `statutoryAuditApplicable` BOOLEAN NOT NULL DEFAULT false,
    `advanceTaxApplicable` BOOLEAN NOT NULL DEFAULT false,
    `pfApplicable` BOOLEAN NOT NULL DEFAULT false,
    `esiApplicable` BOOLEAN NOT NULL DEFAULT false,
    `msmeApplicable` BOOLEAN NOT NULL DEFAULT false,
    `dpt3Applicable` BOOLEAN NOT NULL DEFAULT false,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Client_code_key`(`code`),
    INDEX `Client_groupId_idx`(`groupId`),
    INDEX `Client_partnerId_idx`(`partnerId`),
    INDEX `Client_managerId_idx`(`managerId`),
    INDEX `Client_teamId_idx`(`teamId`),
    INDEX `Client_status_idx`(`status`),
    INDEX `Client_searchName_idx`(`searchName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientFlagHistory` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `flag` VARCHAR(191) NOT NULL,
    `partyKey` TEXT NOT NULL DEFAULT '-',
    `oldValue` TEXT NULL,
    `newValue` TEXT NULL,
    `effectiveDate` TEXT NOT NULL,
    `reason` TEXT NOT NULL DEFAULT '',
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ClientFlagHistory_clientId_flag_idx`(`clientId`, `flag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GSTIN` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `gstin` VARCHAR(191) NOT NULL,
    `stateCode` TEXT NOT NULL,
    `tradeName` TEXT NULL,
    `frequency` TEXT NOT NULL DEFAULT 'MONTHLY',
    `frequencyEffectiveFrom` TEXT NULL,
    `iffOpted` BOOLEAN NOT NULL DEFAULT false,
    `annualReturnApplicable` BOOLEAN NOT NULL DEFAULT false,
    `gstr9cApplicable` BOOLEAN NOT NULL DEFAULT false,
    `registrationDate` TEXT NULL,
    `cancellationDate` TEXT NULL,
    `status` TEXT NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `GSTIN_gstin_key`(`gstin`),
    INDEX `GSTIN_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Director` (
    `id` VARCHAR(191) NOT NULL,
    `din` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `searchName` TEXT NOT NULL DEFAULT '',
    `panEnc` TEXT NULL,
    `email` TEXT NULL,
    `mobile` TEXT NULL,
    `primaryClientId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Director_din_key`(`din`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientDirector` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `directorId` VARCHAR(191) NOT NULL,
    `designation` TEXT NOT NULL DEFAULT 'DIRECTOR',
    `appointedOn` TEXT NULL,
    `ceasedOn` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ClientDirector_clientId_directorId_key`(`clientId`, `directorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `role` TEXT NOT NULL DEFAULT '',
    `email` TEXT NULL,
    `phone` TEXT NULL,
    `whatsapp` TEXT NULL,
    `preferredChannel` TEXT NOT NULL DEFAULT 'EMAIL',
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `isBilling` BOOLEAN NOT NULL DEFAULT false,
    `birthday` TEXT NULL,
    `optOutCampaigns` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Contact_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientPtRegistration` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `stateCode` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'EMPLOYER',
    `registrationNo` TEXT NULL,
    `frequency` TEXT NOT NULL DEFAULT 'MONTHLY',
    `effectiveFrom` TEXT NOT NULL,
    `effectiveTo` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ClientPtRegistration_clientId_stateCode_kind_key`(`clientId`, `stateCode`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StageTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `engagementType` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `StageTemplate_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StageTemplateVersion` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'ACTIVE',
    `effectiveFrom` TEXT NOT NULL,
    `approvedById` TEXT NULL,
    `note` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `StageTemplateVersion_templateId_version_key`(`templateId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StageDef` (
    `id` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NOT NULL,
    `index` INTEGER NOT NULL,
    `name` TEXT NOT NULL,
    `reviewLevel` TEXT NOT NULL DEFAULT 'NONE',
    `isClientApproval` BOOLEAN NOT NULL DEFAULT false,
    `isFiling` BOOLEAN NOT NULL DEFAULT false,
    `requiresUdin` BOOLEAN NOT NULL DEFAULT false,
    `requiresDsc` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `StageDef_versionId_index_key`(`versionId`, `index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StageMapping` (
    `id` VARCHAR(191) NOT NULL,
    `fromVersionId` VARCHAR(191) NOT NULL,
    `toVersionId` VARCHAR(191) NOT NULL,
    `fromStageIndex` INTEGER NOT NULL,
    `toStageIndex` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `StageMapping_fromVersionId_toVersionId_fromStageIndex_key`(`fromVersionId`, `toVersionId`, `fromStageIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Engagement` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `serviceLine` TEXT NOT NULL,
    `engagementType` TEXT NOT NULL,
    `recurrence` TEXT NOT NULL DEFAULT 'ONE_TIME',
    `complianceTypeCode` TEXT NULL,
    `stageTemplateVersionId` VARCHAR(191) NULL,
    `feeBasis` TEXT NOT NULL DEFAULT 'FIXED',
    `feePaise` INTEGER NOT NULL DEFAULT 0,
    `ratePaisePerHour` INTEGER NOT NULL DEFAULT 0,
    `budgetMinutes` INTEGER NOT NULL DEFAULT 0,
    `chargeable` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `startDate` TEXT NULL,
    `endDate` TEXT NULL,
    `partnerId` TEXT NULL,
    `managerId` TEXT NULL,
    `eqrRequired` BOOLEAN NOT NULL DEFAULT false,
    `proposalId` TEXT NULL,
    `engagementLetterId` TEXT NULL,
    `closedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Engagement_code_key`(`code`),
    INDEX `Engagement_clientId_idx`(`clientId`),
    INDEX `Engagement_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EngagementAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` TEXT NOT NULL DEFAULT 'MEMBER',
    `fromDate` TEXT NOT NULL,
    `toDate` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `EngagementAssignment_userId_idx`(`userId`),
    INDEX `EngagementAssignment_engagementId_idx`(`engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EngagementBudgetPeriod` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `periodKey` VARCHAR(191) NOT NULL,
    `budgetMinutes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `EngagementBudgetPeriod_engagementId_periodKey_key`(`engagementId`, `periodKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NULL,
    `complianceTypeCode` VARCHAR(191) NULL,
    `partyKey` VARCHAR(191) NOT NULL DEFAULT '-',
    `periodKey` VARCHAR(191) NOT NULL DEFAULT '-',
    `gstinId` VARCHAR(191) NULL,
    `directorId` VARCHAR(191) NULL,
    `title` TEXT NOT NULL,
    `periodLabel` TEXT NOT NULL DEFAULT '',
    `originalDueDate` TEXT NULL,
    `effectiveDueDate` VARCHAR(191) NULL,
    `isProvisional` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UPCOMING',
    `stageTemplateVersionId` VARCHAR(191) NULL,
    `stageIndex` INTEGER NOT NULL DEFAULT 0,
    `pendingFromClient` BOOLEAN NOT NULL DEFAULT false,
    `pendingSince` TEXT NULL,
    `underReview` BOOLEAN NOT NULL DEFAULT false,
    `ackType` TEXT NULL,
    `ackNumber` TEXT NULL,
    `filedDate` TEXT NULL,
    `filedById` TEXT NULL,
    `signoffRecorded` BOOLEAN NOT NULL DEFAULT false,
    `udinRecordId` TEXT NULL,
    `notApplicableReason` TEXT NULL,
    `supersededByTaskId` TEXT NULL,
    `amendsTaskId` TEXT NULL,
    `budgetMinutes` INTEGER NOT NULL DEFAULT 0,
    `isOneOff` BOOLEAN NOT NULL DEFAULT false,
    `closedAt` DATETIME(3) NULL,
    `periodStart` TEXT NOT NULL DEFAULT '',
    `periodEnd` TEXT NOT NULL DEFAULT '',
    `dueBasis` TEXT NOT NULL DEFAULT '',
    `holidayShifted` BOOLEAN NOT NULL DEFAULT false,
    `taxDuePaise` INTEGER NULL,
    `underReviewSince` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Task_engagementId_idx`(`engagementId`),
    INDEX `Task_clientId_status_idx`(`clientId`, `status`),
    INDEX `Task_status_idx`(`status`),
    INDEX `Task_effectiveDueDate_idx`(`effectiveDueDate`),
    UNIQUE INDEX `Task_clientId_complianceTypeCode_partyKey_periodKey_key`(`clientId`, `complianceTypeCode`, `partyKey`, `periodKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` TEXT NOT NULL,
    `fromDate` TEXT NOT NULL,
    `toDate` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `TaskAssignment_userId_idx`(`userId`),
    INDEX `TaskAssignment_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskStage` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `stageIndex` INTEGER NOT NULL,
    `name` TEXT NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `completedById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `TaskStage_taskId_stageIndex_key`(`taskId`, `stageIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `fromStatus` TEXT NULL,
    `toStatus` TEXT NOT NULL,
    `reason` TEXT NOT NULL DEFAULT '',
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `TaskStatusHistory_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DueDateHistory` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `oldValue` TEXT NULL,
    `newValue` TEXT NOT NULL,
    `source` TEXT NOT NULL,
    `reference` TEXT NOT NULL DEFAULT '',
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `DueDateHistory_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Acknowledgment` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `ackType` TEXT NOT NULL,
    `number` TEXT NOT NULL,
    `date` TEXT NOT NULL,
    `documentId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Acknowledgment_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InternalCategory` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `chargeable` BOOLEAN NOT NULL DEFAULT false,
    `feedsCpe` BOOLEAN NOT NULL DEFAULT false,
    `linksLead` BOOLEAN NOT NULL DEFAULT false,
    `linksKnowledge` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `InternalCategory_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DescriptionChip` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `DescriptionChip_label_key`(`label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkEntry` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `engagementId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `internalCategoryId` VARCHAR(191) NULL,
    `stageIndex` INTEGER NULL,
    `stageName` TEXT NULL,
    `minutes` INTEGER NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `chips` TEXT NOT NULL DEFAULT '',
    `location` TEXT NOT NULL DEFAULT 'OFFICE',
    `clientSiteClientId` TEXT NULL,
    `outcomeType` TEXT NULL,
    `outcomeRef` TEXT NULL,
    `chargeable` BOOLEAN NOT NULL DEFAULT false,
    `leadId` TEXT NULL,
    `knowledgeArticleId` TEXT NULL,
    `clientUuid` VARCHAR(191) NULL,
    `source` TEXT NOT NULL DEFAULT 'WEB',
    `locked` BOOLEAN NOT NULL DEFAULT false,
    `lockedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `WorkEntry_clientUuid_key`(`clientUuid`),
    INDEX `WorkEntry_userId_date_idx`(`userId`, `date`),
    INDEX `WorkEntry_clientId_idx`(`clientId`),
    INDEX `WorkEntry_engagementId_idx`(`engagementId`),
    INDEX `WorkEntry_date_idx`(`date`),
    INDEX `WorkEntry_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecentPair` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL DEFAULT '-',
    `taskId` VARCHAR(191) NOT NULL DEFAULT '-',
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `useCount` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `RecentPair_userId_clientId_engagementId_taskId_key`(`userId`, `clientId`, `engagementId`, `taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkTimer` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `clientId` TEXT NULL,
    `engagementId` TEXT NULL,
    `taskId` TEXT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `stoppedAt` DATETIME(3) NULL,
    `workEntryId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `WorkTimer_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WeeklyLock` (
    `id` VARCHAR(191) NOT NULL,
    `weekStart` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL DEFAULT 'FIRM',
    `userId` VARCHAR(191) NULL,
    `lockAt` DATETIME(3) NOT NULL,
    `lockedAt` DATETIME(3) NULL,
    `extendedUntil` DATETIME(3) NULL,
    `extendedById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `WeeklyLock_weekStart_scope_userId_key`(`weekStart`, `scope`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CorrectionRequest` (
    `id` VARCHAR(191) NOT NULL,
    `workEntryId` VARCHAR(191) NOT NULL,
    `requestedById` TEXT NOT NULL,
    `reason` TEXT NOT NULL,
    `proposedJson` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approverId` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NOT NULL DEFAULT '',
    `appliedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `CorrectionRequest_workEntryId_idx`(`workEntryId`),
    INDEX `CorrectionRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `employeeCode` VARCHAR(191) NOT NULL,
    `employeeCategory` TEXT NOT NULL DEFAULT 'STAFF',
    `dateOfBirth` TEXT NULL,
    `gender` TEXT NULL,
    `personalEmail` TEXT NULL,
    `personalMobile` TEXT NULL,
    `address` TEXT NOT NULL DEFAULT '',
    `emergencyName` TEXT NOT NULL DEFAULT '',
    `emergencyPhone` TEXT NOT NULL DEFAULT '',
    `bankNameEnc` TEXT NULL,
    `bankAccountEnc` TEXT NULL,
    `bankIfscEnc` TEXT NULL,
    `panEnc` TEXT NULL,
    `aadhaarEnc` TEXT NULL,
    `aadhaarLast4` TEXT NULL,
    `uan` TEXT NULL,
    `esiNumber` TEXT NULL,
    `qualifications` TEXT NOT NULL DEFAULT '',
    `membershipBody` TEXT NULL,
    `membershipNo` TEXT NULL,
    `joiningDate` TEXT NULL,
    `confirmationDate` TEXT NULL,
    `exitDate` TEXT NULL,
    `workStateCode` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `EmployeeProfile_userId_key`(`userId`),
    UNIQUE INDEX `EmployeeProfile_employeeCode_key`(`employeeCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeDocument` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `documentId` TEXT NOT NULL,
    `kind` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `status` TEXT NOT NULL,
    `location` TEXT NULL,
    `clientId` TEXT NULL,
    `source` TEXT NOT NULL DEFAULT 'DERIVED',
    `checkInAt` DATETIME(3) NULL,
    `checkInNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Attendance_userId_date_key`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regularisation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` TEXT NOT NULL,
    `requestedStatus` TEXT NOT NULL,
    `reason` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'PENDING',
    `approverId` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Regularisation_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeavePolicy` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `employeeCategory` TEXT NOT NULL,
    `leaveType` TEXT NOT NULL,
    `quotaHalfDays` INTEGER NOT NULL,
    `accrual` TEXT NOT NULL DEFAULT 'ANNUAL',
    `carryForwardMaxHalfDays` INTEGER NOT NULL DEFAULT 0,
    `encashable` BOOLEAN NOT NULL DEFAULT false,
    `effectiveFrom` TEXT NOT NULL,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveBalance` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `leaveType` VARCHAR(191) NOT NULL,
    `fy` VARCHAR(191) NOT NULL,
    `openingHalfDays` INTEGER NOT NULL DEFAULT 0,
    `accruedHalfDays` INTEGER NOT NULL DEFAULT 0,
    `takenHalfDays` INTEGER NOT NULL DEFAULT 0,
    `encashedHalfDays` INTEGER NOT NULL DEFAULT 0,
    `adjustedHalfDays` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `LeaveBalance_userId_leaveType_fy_key`(`userId`, `leaveType`, `fy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `leaveType` TEXT NOT NULL,
    `reason` TEXT NOT NULL,
    `note` TEXT NOT NULL DEFAULT '',
    `fromDate` VARCHAR(191) NOT NULL,
    `toDate` TEXT NOT NULL,
    `halfDayStart` BOOLEAN NOT NULL DEFAULT false,
    `halfDayEnd` BOOLEAN NOT NULL DEFAULT false,
    `halfDays` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approverId` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NOT NULL DEFAULT '',
    `conflictsReviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `LeaveRequest_userId_fromDate_idx`(`userId`, `fromDate`),
    INDEX `LeaveRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalaryStructure` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `effectiveFrom` VARCHAR(191) NOT NULL,
    `kind` TEXT NOT NULL DEFAULT 'SALARY',
    `componentsEnc` TEXT NOT NULL,
    `monthlyGrossPaiseEnc` TEXT NOT NULL,
    `regime` TEXT NOT NULL DEFAULT 'NEW',
    `status` TEXT NOT NULL DEFAULT 'DRAFT',
    `approvedById` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `SalaryStructure_userId_effectiveFrom_idx`(`userId`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollRun` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'SALARY',
    `status` TEXT NOT NULL DEFAULT 'DRAFT',
    `reviewedById` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `approvedById` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `totalsEnc` TEXT NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `PayrollRun_month_kind_key`(`month`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payslip` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `daysInMonth` INTEGER NOT NULL,
    `lopHalfDays` INTEGER NOT NULL DEFAULT 0,
    `linesEnc` TEXT NOT NULL,
    `grossPaiseEnc` TEXT NOT NULL,
    `netPaiseEnc` TEXT NOT NULL,
    `pfPaise` INTEGER NOT NULL DEFAULT 0,
    `esiPaise` INTEGER NOT NULL DEFAULT 0,
    `ptPaise` INTEGER NOT NULL DEFAULT 0,
    `tdsPaise` INTEGER NOT NULL DEFAULT 0,
    `pdfDocumentId` TEXT NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Payslip_runId_userId_key`(`runId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvestmentDeclaration` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fy` VARCHAR(191) NOT NULL,
    `regime` TEXT NOT NULL DEFAULT 'NEW',
    `itemsEnc` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'DRAFT',
    `proofsSubmittedAt` DATETIME(3) NULL,
    `verifiedById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `InvestmentDeclaration_userId_fy_key`(`userId`, `fy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvestmentProof` (
    `id` VARCHAR(191) NOT NULL,
    `declarationId` VARCHAR(191) NOT NULL,
    `section` TEXT NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `documentId` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Form16` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fy` VARCHAR(191) NOT NULL,
    `partADocId` TEXT NULL,
    `pdfDocumentId` TEXT NULL,
    `generatedAt` DATETIME(3) NULL,
    `issuedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Form16_userId_fy_key`(`userId`, `fy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PfRate` (
    `id` VARCHAR(191) NOT NULL,
    `effectiveFrom` TEXT NOT NULL,
    `employeeBp` INTEGER NOT NULL,
    `employerEpfBp` INTEGER NOT NULL,
    `employerEpsBp` INTEGER NOT NULL,
    `epsWageCeilingPaise` INTEGER NOT NULL,
    `pfWageCeilingPaise` INTEGER NOT NULL,
    `adminBp` INTEGER NOT NULL DEFAULT 0,
    `edliBp` INTEGER NOT NULL DEFAULT 0,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EsiRate` (
    `id` VARCHAR(191) NOT NULL,
    `effectiveFrom` TEXT NOT NULL,
    `employeeBp` INTEGER NOT NULL,
    `employerBp` INTEGER NOT NULL,
    `wageCeilingPaise` INTEGER NOT NULL,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProfessionalTaxSlab` (
    `id` VARCHAR(191) NOT NULL,
    `stateCode` VARCHAR(191) NOT NULL,
    `fromPaise` INTEGER NOT NULL,
    `toPaise` INTEGER NULL,
    `amountPaise` INTEGER NOT NULL,
    `gender` TEXT NOT NULL DEFAULT 'ANY',
    `overrideMonth` INTEGER NULL,
    `overrideAmountPaise` INTEGER NULL,
    `effectiveFrom` VARCHAR(191) NOT NULL,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ProfessionalTaxSlab_stateCode_effectiveFrom_idx`(`stateCode`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncomeTaxSlab` (
    `id` VARCHAR(191) NOT NULL,
    `fy` VARCHAR(191) NOT NULL,
    `regime` VARCHAR(191) NOT NULL,
    `fromPaise` INTEGER NOT NULL,
    `toPaise` INTEGER NULL,
    `rateBp` INTEGER NOT NULL,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `IncomeTaxSlab_fy_regime_idx`(`fy`, `regime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxParameter` (
    `id` VARCHAR(191) NOT NULL,
    `fy` VARCHAR(191) NOT NULL,
    `regime` VARCHAR(191) NOT NULL DEFAULT 'ANY',
    `key` VARCHAR(191) NOT NULL,
    `valueInt` INTEGER NOT NULL,
    `unit` TEXT NOT NULL DEFAULT 'PAISE',
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `TaxParameter_fy_regime_key_key`(`fy`, `regime`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StipendMinimum` (
    `id` VARCHAR(191) NOT NULL,
    `institute` TEXT NOT NULL,
    `locationClass` TEXT NOT NULL,
    `yearOfTraining` INTEGER NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `effectiveFrom` TEXT NOT NULL,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CpeRequirement` (
    `id` VARCHAR(191) NOT NULL,
    `institute` TEXT NOT NULL,
    `memberClass` TEXT NOT NULL,
    `blockStartYear` INTEGER NOT NULL,
    `blockYears` INTEGER NOT NULL,
    `structuredMinutes` INTEGER NOT NULL,
    `totalMinutes` INTEGER NOT NULL,
    `perYearMinutes` INTEGER NOT NULL,
    `effectiveFrom` TEXT NOT NULL,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConveyanceRate` (
    `id` VARCHAR(191) NOT NULL,
    `mode` TEXT NOT NULL,
    `ratePaise` INTEGER NOT NULL,
    `effectiveFrom` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Opening` (
    `id` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `kind` TEXT NOT NULL DEFAULT 'STAFF',
    `status` TEXT NOT NULL DEFAULT 'OPEN',
    `ownerId` TEXT NULL,
    `openedAt` TEXT NOT NULL,
    `closedAt` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Candidate` (
    `id` VARCHAR(191) NOT NULL,
    `openingId` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `email` TEXT NULL,
    `phone` TEXT NULL,
    `source` TEXT NOT NULL DEFAULT '',
    `stage` TEXT NOT NULL DEFAULT 'APPLIED',
    `rejectedReason` TEXT NULL,
    `resumeDocId` TEXT NULL,
    `offerLetterDocId` TEXT NULL,
    `joinedUserId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Interview` (
    `id` VARCHAR(191) NOT NULL,
    `candidateId` VARCHAR(191) NOT NULL,
    `interviewerId` TEXT NOT NULL,
    `scheduledAt` TEXT NOT NULL,
    `scoreJson` TEXT NOT NULL DEFAULT '{}',
    `recommendation` TEXT NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeOnboardingItem` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` TEXT NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneAt` DATETIME(3) NULL,
    `doneById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `EmployeeOnboardingItem_userId_code_key`(`userId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppraisalCycle` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `kind` TEXT NOT NULL DEFAULT 'ANNUAL',
    `startDate` TEXT NOT NULL,
    `endDate` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'GOAL_SETTING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppraisalReview` (
    `id` VARCHAR(191) NOT NULL,
    `cycleId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `managerId` TEXT NULL,
    `partnerId` TEXT NULL,
    `selfReview` TEXT NOT NULL DEFAULT '',
    `selfSubmittedAt` DATETIME(3) NULL,
    `managerReview` TEXT NOT NULL DEFAULT '',
    `managerRating` INTEGER NULL,
    `managerSubmittedAt` DATETIME(3) NULL,
    `moderatedRating` INTEGER NULL,
    `finalRating` INTEGER NULL,
    `incrementRecommendationBp` INTEGER NULL,
    `evidenceSnapshotJson` TEXT NOT NULL DEFAULT '{}',
    `status` TEXT NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `AppraisalReview_cycleId_userId_key`(`cycleId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Goal` (
    `id` VARCHAR(191) NOT NULL,
    `reviewId` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `weightPct` INTEGER NOT NULL DEFAULT 0,
    `status` TEXT NOT NULL DEFAULT 'OPEN',
    `selfComment` TEXT NOT NULL DEFAULT '',
    `managerComment` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CPELog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `minutes` INTEGER NOT NULL,
    `structured` BOOLEAN NOT NULL DEFAULT true,
    `provider` TEXT NOT NULL DEFAULT '',
    `topic` TEXT NOT NULL,
    `certificateDocId` TEXT NULL,
    `workEntryId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `CPELog_userId_date_idx`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Skill` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `serviceLine` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Skill_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeSkill` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `EmployeeSkill_userId_skillId_key`(`userId`, `skillId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainingSession` (
    `id` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `date` TEXT NOT NULL,
    `minutes` INTEGER NOT NULL,
    `trainer` TEXT NOT NULL DEFAULT '',
    `cpeEligible` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainingAttendance` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `attended` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `TrainingAttendance_sessionId_userId_key`(`sessionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseClaim` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` TEXT NOT NULL,
    `kind` TEXT NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `distanceKm` INTEGER NULL,
    `clientId` TEXT NULL,
    `workEntryId` TEXT NULL,
    `clientRecoverable` BOOLEAN NOT NULL DEFAULT false,
    `description` TEXT NOT NULL DEFAULT '',
    `receiptDocId` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approverId` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `paidVia` TEXT NULL,
    `paidAt` DATETIME(3) NULL,
    `payrollRunId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ExpenseClaim_userId_idx`(`userId`),
    INDEX `ExpenseClaim_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `tag` VARCHAR(191) NOT NULL,
    `kind` TEXT NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `serial` TEXT NOT NULL DEFAULT '',
    `purchaseDate` TEXT NULL,
    `condition` TEXT NOT NULL DEFAULT 'GOOD',
    `status` TEXT NOT NULL DEFAULT 'IN_STOCK',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Asset_tag_key`(`tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `issuedAt` TEXT NOT NULL,
    `returnedAt` TEXT NULL,
    `conditionOnReturn` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `AssetAssignment_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExitCase` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `resignationDate` TEXT NOT NULL,
    `lastWorkingDate` TEXT NULL,
    `noticeDays` INTEGER NOT NULL DEFAULT 0,
    `status` TEXT NOT NULL DEFAULT 'NOTICE',
    `ffComputedEnc` TEXT NULL,
    `relievingLetterDocId` TEXT NULL,
    `experienceLetterDocId` TEXT NULL,
    `instituteClosureNote` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ExitCase_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExitChecklistItem` (
    `id` VARCHAR(191) NOT NULL,
    `exitCaseId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` TEXT NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneAt` DATETIME(3) NULL,
    `doneById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ExitChecklistItem_exitCaseId_code_key`(`exitCaseId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PolicyDocument` (
    `id` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `kind` TEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `documentId` TEXT NULL,
    `body` TEXT NOT NULL DEFAULT '',
    `effectiveFrom` TEXT NOT NULL,
    `requiresAck` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PolicyAcknowledgment` (
    `id` VARCHAR(191) NOT NULL,
    `policyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `acknowledgedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `PolicyAcknowledgment_policyId_userId_key`(`policyId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ArticleshipRecord` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `institute` TEXT NOT NULL DEFAULT 'ICAI',
    `registrationNo` TEXT NOT NULL,
    `principalId` TEXT NOT NULL,
    `startDate` TEXT NOT NULL,
    `expectedEndDate` TEXT NOT NULL,
    `revisedEndDate` TEXT NULL,
    `leaveEntitledDays` INTEGER NOT NULL DEFAULT 0,
    `stipendYear` INTEGER NOT NULL DEFAULT 1,
    `status` TEXT NOT NULL DEFAULT 'ACTIVE',
    `completionDate` TEXT NULL,
    `terminationDate` TEXT NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `ArticleshipRecord_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ArticleshipNote` (
    `id` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NOT NULL,
    `authorId` TEXT NOT NULL,
    `date` TEXT NOT NULL,
    `kind` TEXT NOT NULL,
    `text` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HRLetter` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` TEXT NOT NULL,
    `templateVersionId` TEXT NULL,
    `documentId` TEXT NULL,
    `issuedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `HRLetter_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PortalUser` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `mobile` TEXT NULL,
    `passwordHash` TEXT NULL,
    `totpSecretEnc` TEXT NULL,
    `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sessionEpoch` INTEGER NOT NULL DEFAULT 0,
    `failedLogins` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `contactId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `PortalUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PortalUserClient` (
    `id` VARCHAR(191) NOT NULL,
    `portalUserId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `PortalUserClient_portalUserId_clientId_key`(`portalUserId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PortalInvite` (
    `id` VARCHAR(191) NOT NULL,
    `portalUserId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `PortalInvite_tokenHash_key`(`tokenHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PortalUpload` (
    `id` VARCHAR(191) NOT NULL,
    `portalUserId` TEXT NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `engagementId` TEXT NULL,
    `taskId` TEXT NULL,
    `checklistItemId` TEXT NULL,
    `documentId` TEXT NOT NULL,
    `autoTag` TEXT NULL,
    `confirmedById` TEXT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `PortalUpload_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageThread` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `engagementId` TEXT NULL,
    `subject` TEXT NOT NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `firstUnansweredAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `MessageThread_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageThreadParticipant` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `removedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `MessageThreadParticipant_threadId_userId_key`(`threadId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `authorUserId` TEXT NULL,
    `authorPortalUserId` TEXT NULL,
    `body` TEXT NOT NULL,
    `documentId` TEXT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readByClientAt` DATETIME(3) NULL,
    `readByFirmAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Message_threadId_idx`(`threadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientApproval` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `portalUserId` TEXT NOT NULL,
    `decision` TEXT NOT NULL,
    `comment` TEXT NOT NULL DEFAULT '',
    `documentId` TEXT NULL,
    `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ClientApproval_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientApprovalRequest` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `documentId` TEXT NULL,
    `title` TEXT NOT NULL,
    `note` TEXT NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `approvalId` TEXT NULL,
    `requestedById` TEXT NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `withdrawnAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ClientApprovalRequest_clientId_status_idx`(`clientId`, `status`),
    INDEX `ClientApprovalRequest_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Folder` (
    `id` VARCHAR(191) NOT NULL,
    `parentId` TEXT NULL,
    `clientId` VARCHAR(191) NULL,
    `engagementId` VARCHAR(191) NULL,
    `periodKey` TEXT NULL,
    `name` TEXT NOT NULL,
    `path` TEXT NOT NULL,
    `kind` TEXT NOT NULL DEFAULT 'OTHER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Folder_clientId_idx`(`clientId`),
    INDEX `Folder_engagementId_idx`(`engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `engagementId` VARCHAR(191) NULL,
    `taskId` TEXT NULL,
    `employeeUserId` VARCHAR(191) NULL,
    `name` TEXT NOT NULL,
    `kind` TEXT NOT NULL DEFAULT 'OTHER',
    `sourceType` TEXT NOT NULL DEFAULT 'UPLOAD',
    `confidentiality` TEXT NOT NULL DEFAULT 'NORMAL',
    `tagsCsv` TEXT NOT NULL DEFAULT '',
    `sharedWithClient` BOOLEAN NOT NULL DEFAULT false,
    `currentVersion` INTEGER NOT NULL DEFAULT 1,
    `checkedOutById` TEXT NULL,
    `checkedOutAt` DATETIME(3) NULL,
    `auditSectionCode` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Document_clientId_idx`(`clientId`),
    INDEX `Document_engagementId_idx`(`engagementId`),
    INDEX `Document_employeeUserId_idx`(`employeeUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentVersion` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `storagePath` TEXT NOT NULL,
    `originalName` TEXT NOT NULL,
    `mimeType` TEXT NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` TEXT NOT NULL,
    `uploadedByPortalUserId` TEXT NULL,
    `note` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `DocumentVersion_documentId_version_key`(`documentId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentSearchToken` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `DocumentSearchToken_token_idx`(`token`),
    UNIQUE INDEX `DocumentSearchToken_documentId_token_key`(`documentId`, `token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditFileSection` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `complete` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `AuditFileSection_engagementId_code_key`(`engagementId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QCChecklist` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `templateCode` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'OPEN',
    `completedById` TEXT NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `QCChecklist_engagementId_idx`(`engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QCChecklistItem` (
    `id` VARCHAR(191) NOT NULL,
    `checklistId` VARCHAR(191) NOT NULL,
    `label` TEXT NOT NULL,
    `response` TEXT NOT NULL DEFAULT '',
    `note` TEXT NOT NULL DEFAULT '',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IndependenceDeclaration` (
    `id` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `declaredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `hasConflict` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `IndependenceDeclaration_engagementId_userId_key`(`engagementId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QCInspection` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `periodFrom` TEXT NOT NULL,
    `periodTo` TEXT NOT NULL,
    `inspectorId` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'OPEN',
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QCInspectionSample` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NOT NULL,
    `engagementId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `QCInspectionSample_inspectionId_engagementId_key`(`inspectionId`, `engagementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QCFinding` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NOT NULL,
    `engagementId` TEXT NULL,
    `finding` TEXT NOT NULL,
    `severity` TEXT NOT NULL DEFAULT 'MEDIUM',
    `correctiveAction` TEXT NOT NULL DEFAULT '',
    `ownerId` TEXT NULL,
    `dueDate` TEXT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PeerReviewPack` (
    `id` VARCHAR(191) NOT NULL,
    `periodFrom` TEXT NOT NULL,
    `periodTo` TEXT NOT NULL,
    `documentId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Template` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `category` TEXT NOT NULL,
    `outputFormat` TEXT NOT NULL DEFAULT 'PDF',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Template_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateVersion` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `mergeFieldsCsv` TEXT NOT NULL DEFAULT '',
    `status` TEXT NOT NULL DEFAULT 'DRAFT',
    `approvedById` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `TemplateVersion_templateId_version_key`(`templateId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeArticle` (
    `id` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `kind` TEXT NOT NULL,
    `serviceLine` TEXT NULL,
    `sourceRef` TEXT NOT NULL DEFAULT '',
    `tagsCsv` TEXT NOT NULL DEFAULT '',
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeArticleLink` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `complianceTypeCode` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `KnowledgeArticleLink_articleId_complianceTypeCode_key`(`articleId`, `complianceTypeCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
    `id` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `authorId` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Comment_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Mention` (
    `id` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `userId` TEXT NOT NULL,
    `notifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Meeting` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` TEXT NOT NULL,
    `engagementId` TEXT NULL,
    `title` TEXT NOT NULL,
    `scheduledAt` TEXT NOT NULL,
    `durationMinutes` INTEGER NOT NULL DEFAULT 60,
    `location` TEXT NOT NULL DEFAULT '',
    `agenda` TEXT NOT NULL DEFAULT '',
    `notes` TEXT NOT NULL DEFAULT '',
    `organizerId` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'SCHEDULED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingAttendee` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `userId` TEXT NULL,
    `contactId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActionItem` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `ownerId` TEXT NOT NULL,
    `dueDate` TEXT NULL,
    `taskId` TEXT NULL,
    `status` TEXT NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `portalUserId` VARCHAR(191) NULL,
    `kind` TEXT NOT NULL,
    `title` TEXT NOT NULL,
    `body` TEXT NOT NULL DEFAULT '',
    `link` TEXT NOT NULL DEFAULT '',
    `entityType` TEXT NULL,
    `entityId` TEXT NULL,
    `priority` TEXT NOT NULL DEFAULT 'NORMAL',
    `dedupeKey` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Notification_dedupeKey_key`(`dedupeKey`),
    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    INDEX `Notification_portalUserId_readAt_idx`(`portalUserId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationPreference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `quietFrom` TEXT NULL,
    `quietTo` TEXT NULL,
    `browserEnabled` BOOLEAN NOT NULL DEFAULT true,
    `mutedKindsCsv` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `NotificationPreference_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HelpdeskTicket` (
    `id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `raisedById` TEXT NOT NULL,
    `category` TEXT NOT NULL,
    `queue` VARCHAR(191) NOT NULL DEFAULT 'ADMIN',
    `subject` TEXT NOT NULL,
    `description` TEXT NOT NULL,
    `screenshotDocId` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `assigneeId` TEXT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `reopenedCount` INTEGER NOT NULL DEFAULT 0,
    `faqArticleId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `HelpdeskTicket_number_key`(`number`),
    INDEX `HelpdeskTicket_status_queue_idx`(`status`, `queue`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketReply` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `authorId` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `isInternal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Badge` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Badge_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Applause` (
    `id` VARCHAR(191) NOT NULL,
    `toUserId` VARCHAR(191) NOT NULL,
    `fromUserId` TEXT NOT NULL,
    `badgeCode` TEXT NULL,
    `message` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `Applause_toUserId_idx`(`toUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RetentionRule` (
    `id` VARCHAR(191) NOT NULL,
    `recordType` VARCHAR(191) NOT NULL,
    `retainYears` INTEGER NULL,
    `basis` TEXT NOT NULL DEFAULT '',
    `purgeEnabled` BOOLEAN NOT NULL DEFAULT false,
    `source` TEXT NOT NULL DEFAULT '',
    `verifiedById` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `RetentionRule_recordType_key`(`recordType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurgeRequest` (
    `id` VARCHAR(191) NOT NULL,
    `recordType` TEXT NOT NULL,
    `entityIdsJson` TEXT NOT NULL,
    `count` INTEGER NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'PENDING',
    `requestedById` TEXT NOT NULL,
    `approvedById` TEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `executedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actorType` TEXT NOT NULL DEFAULT 'USER',
    `actorUserId` VARCHAR(191) NULL,
    `actorPortalUserId` TEXT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `action` TEXT NOT NULL,
    `beforeJson` TEXT NULL,
    `afterJson` TEXT NULL,
    `reason` TEXT NOT NULL DEFAULT '',
    `lockState` TEXT NULL,
    `ip` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_actorUserId_at_idx`(`actorUserId`, `at`),
    INDEX `AuditLog_at_idx`(`at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SensitiveViewLog` (
    `id` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actorUserId` VARCHAR(191) NULL,
    `actorPortalUserId` TEXT NULL,
    `kind` TEXT NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `detail` TEXT NOT NULL DEFAULT '',
    `ip` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `SensitiveViewLog_actorUserId_at_idx`(`actorUserId`, `at`),
    INDEX `SensitiveViewLog_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportJob` (
    `id` VARCHAR(191) NOT NULL,
    `kind` TEXT NOT NULL,
    `fileName` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'UPLOADED',
    `totalRows` INTEGER NOT NULL DEFAULT 0,
    `validRows` INTEGER NOT NULL DEFAULT 0,
    `errorRows` INTEGER NOT NULL DEFAULT 0,
    `summaryJson` TEXT NOT NULL DEFAULT '{}',
    `appliedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportRow` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `dataJson` TEXT NOT NULL,
    `errorsJson` TEXT NOT NULL DEFAULT '[]',
    `status` TEXT NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `ImportRow_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExportJob` (
    `id` VARCHAR(191) NOT NULL,
    `kind` TEXT NOT NULL,
    `paramsJson` TEXT NOT NULL DEFAULT '{}',
    `rowCount` INTEGER NOT NULL DEFAULT 0,
    `fileName` TEXT NOT NULL DEFAULT '',
    `status` TEXT NOT NULL DEFAULT 'DONE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `valueJson` TEXT NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `Setting_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackupRecord` (
    `id` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` TEXT NOT NULL,
    `kind` TEXT NOT NULL,
    `schemaVersion` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'OK',
    `restoreRequestedById` TEXT NULL,
    `restoreRequestedAt` DATETIME(3) NULL,
    `restoreApprovedById` TEXT NULL,
    `restoreApprovedAt` DATETIME(3) NULL,
    `restoredAt` DATETIME(3) NULL,
    `note` TEXT NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    UNIQUE INDEX `BackupRecord_fileName_key`(`fileName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobRun` (
    `id` VARCHAR(191) NOT NULL,
    `jobCode` VARCHAR(191) NOT NULL,
    `trigger` TEXT NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `status` TEXT NOT NULL DEFAULT 'RUNNING',
    `summaryJson` TEXT NOT NULL DEFAULT '{}',
    `error` TEXT NULL,
    `triggeredById` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` TEXT NULL,
    `updatedById` TEXT NULL,

    INDEX `JobRun_jobCode_startedAt_idx`(`jobCode`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InvoiceLine` ADD CONSTRAINT `InvoiceLine_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReceiptAllocation` ADD CONSTRAINT `ReceiptAllocation_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `Receipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReceiptAllocation` ADD CONSTRAINT `ReceiptAllocation_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WriteOff` ADD CONSTRAINT `WriteOff_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Proposal` ADD CONSTRAINT `Proposal_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingItem` ADD CONSTRAINT `OnboardingItem_checklistId_fkey` FOREIGN KEY (`checklistId`) REFERENCES `OnboardingChecklist`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignRecipient` ADD CONSTRAINT `CampaignRecipient_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DueDateRule` ADD CONSTRAINT `DueDateRule_complianceTypeCode_fkey` FOREIGN KEY (`complianceTypeCode`) REFERENCES `ComplianceType`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LateFeeRate` ADD CONSTRAINT `LateFeeRate_complianceTypeCode_fkey` FOREIGN KEY (`complianceTypeCode`) REFERENCES `ComplianceType`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventDate` ADD CONSTRAINT `EventDate_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientComplianceSubscription` ADD CONSTRAINT `ClientComplianceSubscription_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExtensionType` ADD CONSTRAINT `ExtensionType_extensionId_fkey` FOREIGN KEY (`extensionId`) REFERENCES `Extension`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExtensionScope` ADD CONSTRAINT `ExtensionScope_extensionId_fkey` FOREIGN KEY (`extensionId`) REFERENCES `Extension`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewPoint` ADD CONSTRAINT `ReviewPoint_reviewRequestId_fkey` FOREIGN KEY (`reviewRequestId`) REFERENCES `ReviewRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistTemplateItem` ADD CONSTRAINT `ChecklistTemplateItem_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `ChecklistTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PendingRecordItem` ADD CONSTRAINT `PendingRecordItem_pendingRecordId_fkey` FOREIGN KEY (`pendingRecordId`) REFERENCES `PendingRecord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Hearing` ADD CONSTRAINT `Hearing_noticeId_fkey` FOREIGN KEY (`noticeId`) REFERENCES `Notice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DSCClient` ADD CONSTRAINT `DSCClient_dscId_fkey` FOREIGN KEY (`dscId`) REFERENCES `DSC`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DSCMovement` ADD CONSTRAINT `DSCMovement_dscId_fkey` FOREIGN KEY (`dscId`) REFERENCES `DSC`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialGrant` ADD CONSTRAINT `CredentialGrant_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `Credential`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialViewLog` ADD CONSTRAINT `CredentialViewLog_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `Credential`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_designationId_fkey` FOREIGN KEY (`designationId`) REFERENCES `Designation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_reportingManagerId_fkey` FOREIGN KEY (`reportingManagerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSession` ADD CONSTRAINT `UserSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSession` ADD CONSTRAINT `UserSession_portalUserId_fkey` FOREIGN KEY (`portalUserId`) REFERENCES `PortalUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CostRate` ADD CONSTRAINT `CostRate_designationId_fkey` FOREIGN KEY (`designationId`) REFERENCES `Designation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientTeam` ADD CONSTRAINT `ClientTeam_leadManagerId_fkey` FOREIGN KEY (`leadManagerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientTeamMember` ADD CONSTRAINT `ClientTeamMember_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `ClientTeam`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientTeamMember` ADD CONSTRAINT `ClientTeamMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ClientGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `ClientTeam`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientFlagHistory` ADD CONSTRAINT `ClientFlagHistory_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GSTIN` ADD CONSTRAINT `GSTIN_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Director` ADD CONSTRAINT `Director_primaryClientId_fkey` FOREIGN KEY (`primaryClientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientDirector` ADD CONSTRAINT `ClientDirector_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientDirector` ADD CONSTRAINT `ClientDirector_directorId_fkey` FOREIGN KEY (`directorId`) REFERENCES `Director`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientPtRegistration` ADD CONSTRAINT `ClientPtRegistration_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StageTemplateVersion` ADD CONSTRAINT `StageTemplateVersion_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `StageTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StageDef` ADD CONSTRAINT `StageDef_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `StageTemplateVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Engagement` ADD CONSTRAINT `Engagement_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Engagement` ADD CONSTRAINT `Engagement_stageTemplateVersionId_fkey` FOREIGN KEY (`stageTemplateVersionId`) REFERENCES `StageTemplateVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EngagementAssignment` ADD CONSTRAINT `EngagementAssignment_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EngagementAssignment` ADD CONSTRAINT `EngagementAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EngagementBudgetPeriod` ADD CONSTRAINT `EngagementBudgetPeriod_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_gstinId_fkey` FOREIGN KEY (`gstinId`) REFERENCES `GSTIN`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_directorId_fkey` FOREIGN KEY (`directorId`) REFERENCES `Director`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_stageTemplateVersionId_fkey` FOREIGN KEY (`stageTemplateVersionId`) REFERENCES `StageTemplateVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskAssignment` ADD CONSTRAINT `TaskAssignment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskAssignment` ADD CONSTRAINT `TaskAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskStage` ADD CONSTRAINT `TaskStage_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskStatusHistory` ADD CONSTRAINT `TaskStatusHistory_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DueDateHistory` ADD CONSTRAINT `DueDateHistory_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Acknowledgment` ADD CONSTRAINT `Acknowledgment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkEntry` ADD CONSTRAINT `WorkEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkEntry` ADD CONSTRAINT `WorkEntry_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkEntry` ADD CONSTRAINT `WorkEntry_engagementId_fkey` FOREIGN KEY (`engagementId`) REFERENCES `Engagement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkEntry` ADD CONSTRAINT `WorkEntry_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkEntry` ADD CONSTRAINT `WorkEntry_internalCategoryId_fkey` FOREIGN KEY (`internalCategoryId`) REFERENCES `InternalCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeProfile` ADD CONSTRAINT `EmployeeProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeDocument` ADD CONSTRAINT `EmployeeDocument_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payslip` ADD CONSTRAINT `Payslip_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `PayrollRun`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvestmentProof` ADD CONSTRAINT `InvestmentProof_declarationId_fkey` FOREIGN KEY (`declarationId`) REFERENCES `InvestmentDeclaration`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Candidate` ADD CONSTRAINT `Candidate_openingId_fkey` FOREIGN KEY (`openingId`) REFERENCES `Opening`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AppraisalReview` ADD CONSTRAINT `AppraisalReview_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `AppraisalCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Goal` ADD CONSTRAINT `Goal_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `AppraisalReview`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetAssignment` ADD CONSTRAINT `AssetAssignment_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExitChecklistItem` ADD CONSTRAINT `ExitChecklistItem_exitCaseId_fkey` FOREIGN KEY (`exitCaseId`) REFERENCES `ExitCase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PolicyAcknowledgment` ADD CONSTRAINT `PolicyAcknowledgment_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `PolicyDocument`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArticleshipNote` ADD CONSTRAINT `ArticleshipNote_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `ArticleshipRecord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PortalUserClient` ADD CONSTRAINT `PortalUserClient_portalUserId_fkey` FOREIGN KEY (`portalUserId`) REFERENCES `PortalUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PortalInvite` ADD CONSTRAINT `PortalInvite_portalUserId_fkey` FOREIGN KEY (`portalUserId`) REFERENCES `PortalUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageThreadParticipant` ADD CONSTRAINT `MessageThreadParticipant_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `MessageThread`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `MessageThread`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `Folder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QCChecklistItem` ADD CONSTRAINT `QCChecklistItem_checklistId_fkey` FOREIGN KEY (`checklistId`) REFERENCES `QCChecklist`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QCInspectionSample` ADD CONSTRAINT `QCInspectionSample_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `QCInspection`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QCFinding` ADD CONSTRAINT `QCFinding_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `QCInspection`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateVersion` ADD CONSTRAINT `TemplateVersion_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeArticleLink` ADD CONSTRAINT `KnowledgeArticleLink_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `KnowledgeArticle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Mention` ADD CONSTRAINT `Mention_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `Comment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingAttendee` ADD CONSTRAINT `MeetingAttendee_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActionItem` ADD CONSTRAINT `ActionItem_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketReply` ADD CONSTRAINT `TicketReply_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `HelpdeskTicket`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportRow` ADD CONSTRAINT `ImportRow_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `ImportJob`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

