# QEPEX India Work Tracker — Data Model (Phase 0, for approval)

Status: **FROZEN at the end of Phase 1** (migration `20261006144742_init_frozen_phase1`, 181 tables in
`prisma/schema/*.prisma`). The schema is the source of truth; this page is the readable overview
(spec §14.1). Later phases add rows and
seed data, not structural changes; any structural change after freeze needs an
explicit change request and an additive migration.

## Conventions (apply to every table)

- `id String @id @default(cuid())`
- `createdAt`, `updatedAt`, `createdById`, `updatedById` on every table (system jobs use the `SYSTEM` user).
- Money: `Int` **paise** (`amountPaise`). Hours: `Int` **minutes** (`minutes`, multiple of 15).
- Business dates (due dates, entry dates, leave dates): `String` `YYYY-MM-DD` in IST. Timestamps: `DateTime` UTC.
- Status/enum fields: `String`, validated by Zod against `as const` unions (portable SQLite ↔ PostgreSQL).
- Encrypted fields end in `Enc` (`passwordEnc`, `basicPaiseEnc`…) and hold `v1:iv:tag:ciphertext`.
- Effective-dated tables carry `effectiveFrom` (and optional `effectiveTo`), `source`, `notificationRef`, `verifiedBy`, `verifiedAt`.
- Soft delete only where the spec asks for archive (`archivedAt`); audit tables are append-only.

## 1. Core (clients, people, engagements, tasks, work)

```mermaid
erDiagram
  User ||--o| EmployeeProfile : "has"
  User }o--|| Role : "has"
  User }o--o{ ClientTeam : "member (ClientTeamMember)"
  ClientTeam ||--o{ Client : "serves"
  ClientGroup ||--o{ Client : "groups"
  Client ||--o{ GSTIN : "has"
  Client ||--o{ Director : "has (via ClientDirector)"
  Client ||--o{ Contact : "has"
  Client ||--o{ ClientFlagHistory : "flag changes"
  Client ||--o{ Engagement : "has"
  Engagement }o--|| StageTemplateVersion : "uses"
  StageTemplate ||--o{ StageTemplateVersion : "versions"
  StageTemplateVersion ||--o{ StageDef : "stages"
  Engagement ||--o{ Task : "has"
  Engagement ||--o{ EngagementAssignment : "team"
  Task ||--o{ TaskStage : "progress per StageDef"
  Task ||--o{ TaskAssignment : "maker/checker"
  Task ||--o{ WorkEntry : "effort"
  User ||--o{ WorkEntry : "logs"
  InternalCategory ||--o{ WorkEntry : "non-client time"
  WorkEntry ||--o{ CorrectionRequest : "after lock"
  User ||--o{ WeeklyLock : "per week"

  User {
    string username
    string role
    bool isSenior
    bool active
    int sessionEpoch
    string totpSecretEnc
  }
  Client {
    string code "CL-0142"
    string name
    string constitution
    string pan
    string tan
    string cin_llpin
    string udyam
    string status
    string fyEnd
    string agmDate
    string partnerId
    string managerId
    string booksBy
  }
  GSTIN {
    string gstin
    string stateCode
    string frequency "MONTHLY|QRMP|COMPOSITION"
    bool iffOpted
    bool annualReturn
    bool gstr9c
    string effectiveFrom
  }
  Director {
    string name
    string din "8 digits"
    string panEnc
  }
  Engagement {
    string serviceLine
    string type
    string recurrence "RECURRING|ONE_TIME"
    string feeBasis "FIXED|RETAINER|TIME"
    int ratePaise
    int budgetMinutes
    bool chargeable
    string status
  }
  Task {
    string complianceTypeCode
    string partyKey
    string periodKey
    string originalDueDate
    string effectiveDueDate
    bool isProvisional
    string status
    int stageIndex
    string ackType
    string ackNumber
    string filedDate
    string udinId
  }
  WorkEntry {
    string date
    int minutes
    string location
    string clientSiteId
    string description
    string outcomeType
    string outcomeRef
    string clientUuid "offline idempotency"
    bool locked
    string leadId
  }
```

Additional core tables: `Role` (seeded 7 rows), `Designation` (+ `CostRate` effective-dated, Partner/HR only),
`ClientTeamMember`, `ClientDirector` (a director can sit on several client companies — DIR-3 KYC is one task per director, held on `Director.primaryClientId`), `ClientPtRegistration` (client × PT state, registration no., frequency; only states with `State.ptLevied`),
`ClientAssignment` (Partner/Manager/primary contact), `EngagementAssignment`, `TaskAssignment`
(`role: MAKER|CHECKER|EQR`), `EngagementBudgetPeriod` (per-period budgets for recurring work),
`InternalCategory` (seeded: Internal Meeting, Training & CPE, Articleship Classes / Exam Leave,
Practice Administration, Business Development, Knowledge Updates, Leave, Other; `chargeable` flag),
`DescriptionChip`, `RecentPair` (materialised per user for one-tap entry), `WorkTimer`,
`WeeklyLock`, `LockExtension`, `CorrectionRequest`, `UserLocationPolicy` (P1-17).

## 2. Compliance engine

```mermaid
erDiagram
  StageTemplateFamily ||--o{ ComplianceType : "F1..F6"
  ComplianceType ||--o{ DueDateRule : "versioned"
  ComplianceType ||--o{ LateFeeRate : "effective-dated"
  ComplianceType ||--o{ ApplicabilityRule : "flag mapping"
  EventType ||--o{ ComplianceType : "event-linked"
  Client ||--o{ ClientComplianceSubscription : "start/stop per type+party"
  ClientComplianceSubscription }o--|| ComplianceType : ""
  Client ||--o{ EventDate : "AGM, auditor appt, incorporation…"
  Extension }o--o{ ComplianceType : "ExtensionType"
  Extension ||--o{ ExtensionScope : "filter clauses"
  Task ||--o{ DueDateHistory : "Extension|EventCorrection|HolidayShift"
  Task ||--o{ TaskStatusHistory : ""
  Task ||--o| Acknowledgment : "ARN/SRN/ack/CIN/token"
  Holiday }o--o| State : "national or state"
  GstStateGroup }o--|| State : "QRMP 3B 22nd/24th"

  ComplianceType {
    string code "GST-3B-M"
    string name
    string frequency
    string periodBasis "MONTH|FY_QUARTER|FY|AY|EVENT"
    string familyCode
    string ackType
    string weekendHolidayPolicy "NONE|NEXT|PREV"
    bool isFirmOnly
    bool active
  }
  DueDateRule {
    string complianceTypeCode
    int version
    string kind "DAY_OF_NEXT_MONTH|FIXED_MONTH_DAY|QUARTER_TABLE|EVENT_OFFSET|STATE_GROUP_TABLE|MANUAL"
    string paramsJson
    string effectiveFrom
    string verifiedBy
    string source
  }
  Extension {
    string status "DRAFT|PUBLISHED|SUPERSEDED"
    string periodsMode
    string newEffectiveDueDate
    string reason
    string notificationRef
    string supersedesId
  }
  ClientComplianceSubscription {
    string complianceTypeCode
    string partyKey
    string startDate
    string endDate
    string endReason
  }
  EventDate {
    string eventType
    string dateValue
    bool isProvisional
    string source
  }
```

Notes
- `DueDateRule.paramsJson` is a `String` holding validated JSON (e.g. `{ "day": 20, "monthOffset": 1, "marchOverride": "04-30" }`),
  parsed by Zod per `kind`. This keeps "no hard-coded statutory values": every date in the Rules Spec §10 is a seeded row.
- `ApplicabilityFlag` (from the brief) = the flag catalogue (`code`, label, "Applies when" plain-language text, P2-23)
  and `ApplicabilityRule` = the Rules Spec §1.2 mapping rows, both admin-editable.
- Additional: `State` (code, name, `ptLevied` — true for the 19 states/UTs listed in open-questions Q-02), `GstStateGroup`, `ProfessionalTaxRule` (state-specific due rule, Q-02), `JobRun`.

## 3. Review, pending-from-client, registers

```mermaid
erDiagram
  Task ||--o{ ReviewRequest : "maker submits"
  ReviewRequest ||--o{ ReviewPoint : "raised/cleared"
  Task ||--o{ SignOff : "Partner / EQR"
  SignOff }o--o| UDINRecord : "linked"
  ChecklistTemplate ||--o{ ChecklistTemplateItem : ""
  Task ||--o{ ChecklistItem : "per task (editable per client)"
  Task ||--o{ PendingRecord : "what + since when"
  PendingRecord }o--o{ ChecklistItem : "waiting on"
  PendingRecord ||--o{ ReminderLog : "follow-ups"
  Client ||--o{ Notice : ""
  Notice ||--o{ Hearing : "and adjournments"
  Notice ||--o| Engagement : "Notice stage template"
  DSC ||--o{ DSCMovement : "custody log"
  DSC }o--o{ Client : "DSCClient"
  Client ||--o{ Credential : "vault"
  Credential ||--o{ CredentialViewLog : ""
  Credential ||--o{ CredentialGrant : "staff/article if granted"
  Client ||--o{ InwardOutward : ""

  ReviewPoint {
    string text
    string raisedById
    string raisedAt
    string clearedById
    string clearedAt
    string status
  }
  SignOff {
    string level "CHECKER|PARTNER|EQR"
    string signedById
    string signedAt
    bool requiresUdin
  }
  UDINRecord {
    string udin "18 chars"
    string docType
    string signingDate
    string partnerId
    string generatedOn
    string signedDocId
  }
  DSC {
    string holderName
    string class
    string issuer
    string issueDate
    string expiryDate
    string custody "OFFICE|CLIENT|STAFF"
    string location
  }
  Credential {
    string portal
    string usernameEnc
    string passwordEnc
    bool changePeriodically
    string lastChangedOn
  }
  Notice {
    string authority
    string ayOrPeriod
    string section
    string din_ref
    string noticeDate
    string receivedDate
    string responseDue
    string outcome
    int demandPaise
  }
```

## 4. Billing and CRM

```mermaid
erDiagram
  Engagement ||--o{ Invoice : "billed"
  Invoice ||--o{ InvoiceLine : ""
  Invoice ||--o{ ReceiptAllocation : ""
  Receipt ||--o{ ReceiptAllocation : "UPI/NEFT/cheque ref"
  Invoice ||--o| WriteOff : "Partner-approved"
  Disbursement }o--o| InvoiceLine : "recovered via"
  Lead ||--o{ Activity : "call/meeting/email/WhatsApp"
  Lead ||--o{ Proposal : "versions"
  Proposal ||--o| EngagementLetter : "on accept"
  EngagementLetter ||--o{ Engagement : "creates"
  Lead |o--o| Client : "won → client"
  Client ||--o| OnboardingChecklist : ""
  Client ||--o{ ConflictCheck : "Partner decision"
  Client ||--o{ Opportunity : "cross-sell rules"
  Engagement ||--o{ Renewal : "60-day prompt"
  Engagement ||--o{ Feedback : "on close"
  Campaign ||--o{ CampaignRecipient : "copy list"

  Invoice {
    string number "per-FY series"
    string date
    string status
    int taxablePaise
    int cgstPaise
    int sgstPaise
    int igstPaise
    int totalPaise
    string placeOfSupply
    string irn "manual"
    string pdfDocId
  }
  Receipt {
    string date
    int amountPaise
    string mode "UPI|NEFT|RTGS|CHEQUE|CASH"
    string reference
  }
  Lead {
    string stage "NEW..WON|LOST|ON_HOLD"
    string source
    string referrerClientId
    string ownerId
    int estFeePaise
    string nextFollowUp
    string lostReason
  }
  Proposal {
    int version
    string status "DRAFT|APPROVED|SENT|ACCEPTED|REJECTED|EXPIRED"
    int feePaise
    string feeBasis
    int budgetMinutes
  }
  EngagementLetter {
    string status
    string acceptedByPortalUserId
    string acceptedAt
    string signedCopyDocId
  }
```

Additional: `InvoiceSeries` (prefix, FY, next number), `FirmProfile` (GSTIN, bank/UPI text, SAC defaults),
`PaymentReminderLog` (copy-message "Mark as sent"), `ServiceTemplate` (proposal scope templates).

## 5. HRMS

```mermaid
erDiagram
  User ||--|| EmployeeProfile : ""
  EmployeeProfile ||--o{ Attendance : "derived daily"
  Attendance ||--o{ Regularisation : ""
  LeavePolicy ||--o{ LeaveBalance : ""
  EmployeeProfile ||--o{ LeaveBalance : ""
  EmployeeProfile ||--o{ LeaveRequest : ""
  EmployeeProfile ||--o{ SalaryStructure : "effective-dated, Partner-approved"
  PayrollRun ||--o{ Payslip : ""
  Payslip ||--o{ PayslipLine : "earnings/deductions"
  EmployeeProfile ||--o{ InvestmentDeclaration : "per FY"
  EmployeeProfile ||--o{ Form16 : "per FY"
  Opening ||--o{ Candidate : ""
  Candidate ||--o{ Interview : "scorecard"
  AppraisalCycle ||--o{ AppraisalReview : ""
  AppraisalReview ||--o{ Goal : ""
  EmployeeProfile ||--o{ CPELog : ""
  EmployeeProfile ||--o{ EmployeeSkill : "Skill x level"
  EmployeeProfile ||--o{ ExpenseClaim : ""
  Asset ||--o{ AssetAssignment : ""
  EmployeeProfile ||--o| ExitCase : ""
  EmployeeProfile ||--o| ArticleshipRecord : "articles only"
  PolicyDocument ||--o{ PolicyAcknowledgment : ""

  SalaryStructure {
    string effectiveFrom
    string componentsEnc "basic, HRA, allowances, variable"
    string regime "NEW|OLD"
    string approvedById
  }
  PayrollRun {
    string month
    string kind "SALARY|STIPEND"
    string status "DRAFT|REVIEWED|APPROVED|PAID|LOCKED"
  }
  Payslip {
    int grossPaiseEnc
    int pfPaise
    int esiPaise
    int ptPaise
    int tdsPaise
    int lopDays
    int netPaiseEnc
  }
  ArticleshipRecord {
    string institute "ICAI|ICSI"
    string regNo
    string principalId
    string startDate
    string expectedEnd
    int leaveEntitledDays
    int leaveTakenDays
    int stipendYear
  }
```

Statutory parameter tables (admin-editable, effective-dated, each with `source` and `verifiedBy`):
`PfRate`, `EsiRate`, `ProfessionalTaxSlab` (state, wage band, amount, month override),
`IncomeTaxSlab` (FY, regime, band, rate), `TaxParameter` (standard deduction, rebate, surcharge bands, cess),
`StipendMinimum` (institute, location class, year of training), `CpeRequirement` (institute, member class, block),
`ConveyanceRate`, `LwfRate` (only if Q-09 says yes).

## 6. Portal, documents and other modules

```mermaid
erDiagram
  PortalUser }o--o{ Client : "PortalUserClient"
  PortalInvite }o--|| PortalUser : "one-time token (hashed)"
  PortalUser ||--o{ PortalUpload : ""
  PortalUpload }o--o| ChecklistItem : "marks Received (pending confirm)"
  MessageThread ||--o{ Message : ""
  MessageThread }o--|| Client : ""
  Task ||--o{ ClientApproval : "Client Approval stage"
  Folder ||--o{ Document : ""
  Document ||--o{ DocumentVersion : "check-in/out"
  Engagement ||--o{ QCChecklist : ""
  QCInspection ||--o{ QCFinding : ""
  Template ||--o{ TemplateVersion : "Partner-approved"
  KnowledgeArticle }o--o{ ComplianceType : "linked from due-date change"
  Meeting ||--o{ ActionItem : "→ Task"
  Comment ||--o{ Mention : ""
  User ||--o{ Notification : ""
  HelpdeskTicket ||--o{ TicketReply : ""
  User ||--o{ Applause : "received (immutable)"
  Badge ||--o{ Applause : ""
```

Additional: `DocumentTag`, `DocumentSearchToken` (portable full-text index, D-11), `AuditFileSection`,
`IndependenceDeclaration`, `PeerReviewPack`, `RetentionRule`, `PurgeRequest`, `FAQ`, `NotificationPreference`
(quiet hours; overdue escalations cannot be muted), `ClientReminderSchedule`, `ClientReminderDue`.

## 7. System

`AuditLog` (entity, entityId, action, beforeJson, afterJson, actorId, reason, at, lockState),
`SensitiveViewLog` (actorId, kind CREDENTIAL|FINANCIALS|NOTICE|SALARY|BILLING, entityId, at, ip),
`ImportJob` (+ `ImportRow` with validation errors), `ExportJob`, `Setting` (key, valueJson, effectiveFrom),
`BackupRecord` (file, size, sha256, kind AUTO|MANUAL|PRE_RESTORE, restoreRequestedBy, approvedBy),
`JobRun`, `LoginAttempt`, `SystemLogIndex` (optional pointer into rotated log files).

## 8. Entity count and Phase 1 additions

181 tables, all created in Phase 1 (empty where the module comes later), split by domain:
`core.prisma` (37), `compliance.prisma` (35, incl. review, pending, registers), `billing-crm.prisma` (21),
`hr.prisma` (43), `portal-other.prisma` (45).

Added while writing the schema (beyond the design above): `UserSession` (server-side sessions, D-09),
`LoginAttempt`, `StageMapping` (template version moves, P2-24), `ClientPtRegistration` (Q-02),
`EmployeeOnboardingItem`, `TrainingSession`/`TrainingAttendance`, `ExitChecklistItem`, `InvestmentProof`,
`MessageThreadParticipant` (removed at offboarding), `MeetingAttendee`, `KnowledgeArticleLink`, `QCInspectionSample`,
`OnboardingItem`, `PendingRecordItem`, `ExtensionType`, `ExtensionScope`, `ReceiptAllocation`, `CampaignRecipient`.

**Change control after the freeze:** additive migrations only (new nullable columns, new tables, new indexes).
`tests/migration` fails the build if a later migration drops a table/column or deletes rows without an explicit
`-- allow-destructive: <reason>` marker, or if `schema.prisma` drifts from the migrations.
