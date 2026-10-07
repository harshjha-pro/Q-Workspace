/**
 * Phase 3 — collaboration & lifecycle seed (P3-01, P3-04..07, P3-29, P3-31..33).
 * Reference: badges, retention rules ("TODO verify", purge disabled), firm-only compliance types (MANUAL, Unverified).
 * Demo: applause, helpdesk tickets, knowledge articles, comments with mentions, client meetings, archived engagements.
 */
import type { PrismaClient } from "../../../generated/prisma/client";
import { db } from "../../../server/lib/db";
import { addDays, todayIst } from "../../../server/lib/dates";
import type { StaffActor } from "../../../server/permissions/actor";
import { BADGES, giveApplause, applaudablePeople } from "../../../server/services/applause/service";
import { createArticle, linkArticle } from "../../../server/services/knowledge/service";
import { raiseTicket, replyToTicket, assignTicket, setTicketStatus, convertToFaq } from "../../../server/services/helpdesk/service";
import { addComment } from "../../../server/services/comments/service";
import { scheduleMeeting, updateMeeting, addActionItem } from "../../../server/services/meetings/service";
import { closeEngagement } from "../../../server/services/lifecycle/archive";
import { ensureFirmClient, recordFirmObligation } from "../../../server/services/firm-compliance/service";

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const RETENTION_RULES: { recordType: string; basis: string }[] = [
  { recordType: "AUDIT_FILES", basis: "Counted from the engagement's archive date. Must be at least the period ICAI quality-control standards require — TODO verify." },
  { recordType: "WORKING_PAPERS", basis: "Working papers of non-audit engagements, counted from the engagement's archive date — TODO verify." },
  { recordType: "CLIENT_DOCUMENTS", basis: "Client documents not tied to an engagement, counted from upload — TODO verify." },
  { recordType: "PORTAL_UPLOADS", basis: "Files clients uploaded through the portal, counted from upload — TODO verify." },
  { recordType: "PAYROLL", basis: "Payslips and salary records, counted from the document date; labour and tax law periods apply — TODO verify." },
  { recordType: "HELPDESK_SCREENSHOTS", basis: "Screenshots attached to helpdesk tickets, counted from the ticket's closing date — TODO verify." },
  { recordType: "HR_DOCUMENTS", basis: "Employee KYC and HR documents, counted from the exit date — TODO verify." },
  { recordType: "BILLING_RECORDS", basis: "Invoices, receipts and credit notes; GST and income-tax record-keeping periods apply — TODO verify." },
  { recordType: "WORK_ENTRIES", basis: "Daily time entries — TODO verify." },
  { recordType: "CLIENT_MASTER", basis: "Master data of discontinued clients — TODO verify." },
  { recordType: "AUDIT_LOG", basis: "The audit trail is kept for ever and never purged." },
];

/** Firm-only obligations (spec 13.6, D-16). Due dates are typed per instance from the certificate / policy / notice. */
const FIRM_TYPES: { code: string; name: string; shortName: string; frequency: string; appliesWhen: string }[] = [
  { code: "FIRM-ICAI-MEM", name: "ICAI membership fee renewal", shortName: "ICAI membership", frequency: "ANNUAL", appliesWhen: "Each CA member of the firm" },
  { code: "FIRM-ICAI-COP", name: "ICAI Certificate of Practice renewal", shortName: "ICAI COP", frequency: "ANNUAL", appliesWhen: "Each partner / member holding a COP" },
  { code: "FIRM-ICSI-MEM", name: "ICSI membership fee renewal", shortName: "ICSI membership", frequency: "ANNUAL", appliesWhen: "Each CS member of the firm" },
  { code: "FIRM-ICSI-COP", name: "ICSI Certificate of Practice renewal", shortName: "ICSI COP", frequency: "ANNUAL", appliesWhen: "Each CS member holding a COP" },
  { code: "FIRM-REG-UPDATE", name: "Firm registration update with the Institute", shortName: "Firm registration update", frequency: "ONE_TIME", appliesWhen: "Change in partners, name or address of the firm" },
  { code: "FIRM-PI-INSURANCE", name: "Professional indemnity insurance renewal", shortName: "PI insurance", frequency: "ANNUAL", appliesWhen: "Firm's PI policy" },
  { code: "FIRM-PEER-REVIEW", name: "Peer-review certificate validity / renewal", shortName: "Peer review", frequency: "ONE_TIME", appliesWhen: "Firm holds a peer-review certificate" },
  { code: "FIRM-OFFICE-LICENCE", name: "Office licence renewal (shops & establishment, trade)", shortName: "Office licence", frequency: "ANNUAL", appliesWhen: "Each office licence or registration" },
];

export async function seedCollabReference(prisma: PrismaClient) {
  for (const b of BADGES) {
    await prisma.badge.upsert({ where: { code: b.code }, create: { code: b.code, name: b.name, description: b.description, createdById: "system" }, update: { name: b.name, description: b.description } });
  }
  for (const r of RETENTION_RULES) {
    // Never overwrite a period or decision a Partner has already made.
    await prisma.retentionRule.upsert({
      where: { recordType: r.recordType },
      create: { recordType: r.recordType, basis: r.basis, retainYears: null, purgeEnabled: false, source: "TODO verify — open-questions Q-19", createdById: "system" },
      update: {},
    });
  }
  await prisma.stageTemplateFamily.upsert({
    where: { code: "F7" },
    create: { code: "F7", name: "Firm's own compliance", stageTemplateCode: "OTHER", reviewLevel: "NONE", createdById: "system" },
    update: {},
  });
  for (const [i, t] of FIRM_TYPES.entries()) {
    const data = {
      name: t.name, shortName: t.shortName, frequency: t.frequency, periodBasis: "MANUAL", partyBasis: "CLIENT", familyCode: "F7", serviceLine: "ADVISORY",
      ackType: "ACK", appliesWhen: t.appliesWhen, isFirmOnly: true, sortOrder: 900 + i,
    };
    await prisma.complianceType.upsert({ where: { code: t.code }, create: { code: t.code, ...data, createdById: "system" }, update: data });
    if (!(await prisma.dueDateRule.findFirst({ where: { complianceTypeCode: t.code } }))) {
      await prisma.dueDateRule.create({
        data: {
          complianceTypeCode: t.code, version: 1, kind: "MANUAL", paramsJson: JSON.stringify({ kind: "MANUAL" }), effectiveFrom: "2017-04-01",
          source: "Firm-only obligation: the due date is typed from the certificate, policy or notice (D-16) — TODO verify", createdById: "system",
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------
async function actor(username: string): Promise<StaffActor> {
  const u = await db().user.findUniqueOrThrow({ where: { username } });
  return { kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName };
}
const uid = async (username: string) => (await db().user.findUniqueOrThrow({ where: { username } })).id;
const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn();
  } catch {
    return null;
  }
};

const ARTICLES: { title: string; kind: "CIRCULAR" | "NOTIFICATION" | "EXTENSION" | "SOP" | "FAQ"; serviceLine: string | null; tags: string[]; body: string; links?: string[]; by: string }[] = [
  { title: "GSTR-3B: firm checklist before filing", kind: "SOP", serviceLine: "GST", tags: ["GST", "checklist"], links: ["GST-3B-M", "GST-3B-Q"], by: "rohan.iyer",
    body: "1. Download GSTR-2B and reconcile with the purchase register.\n2. Confirm ITC reversals with the client.\n3. Compare outward supplies with GSTR-1 as filed.\n4. Get the client's approval of the tax payable by email or portal before filing.\n5. Record the ARN on the task.\n\nFor due dates and late fees always use the Due-Date Master, which follows the official notifications." },
  { title: "GSTR-1 and IFF: what to check in the sales data", kind: "SOP", serviceLine: "GST", tags: ["GST"], links: ["GST-R1-M", "GST-IFF"], by: "priya.nair",
    body: "Check B2B invoices against the customer GSTINs, credit notes and amendments of earlier periods, and HSN summary. Flag invoices without a valid GSTIN to the Manager. See the official GSTN advisories for the current table-wise instructions." },
  { title: "Circular summary: clarifications on input tax credit (firm note)", kind: "CIRCULAR", serviceLine: "GST", tags: ["GST", "ITC"], by: "sneha.kulkarni",
    body: "Firm note: the CBIC has issued clarifications on availing input tax credit in specific situations. Summary for our team: re-check ITC claimed on the cases listed in the circular and discuss with the Manager before the next return. The exact conditions and dates are in the official circular — read it there; this note does not restate rates or limits." },
  { title: "Notification summary: changes to return forms (firm note)", kind: "NOTIFICATION", serviceLine: "GST", tags: ["GST", "forms"], by: "sneha.kulkarni",
    body: "Firm note: a notification has amended certain return forms. Impact for us: utilities and templates may change; wait for the portal update before preparing. See the official notification for the text and its effective date." },
  { title: "Due-date extension: how we apply it in the app", kind: "EXTENSION", serviceLine: null, tags: ["due dates", "extension"], by: "suresh.pillai",
    body: "When the government notifies an extension, the Practice Admin publishes it in Admin → Due-date master → Extensions, with the notification reference. The preview shows how many tasks move. Filed tasks never move; Filed Late tasks filed on or before the new date become Filed. Link this article (or the notification summary) to the affected compliance types." },
  { title: "Income tax: documents to collect for individual returns", kind: "SOP", serviceLine: "DIRECT_TAX", tags: ["ITR", "checklist"], links: ["ITR-NA"], by: "imran.shaikh",
    body: "Collect Form 16, AIS/TIS, bank statements and interest certificates, capital-gains statements, rent receipts and investment proofs. Reconcile AIS with the client's records before preparing the return. Use the Pending-from-client checklist on the task so reminders go out automatically." },
  { title: "Circular summary: processing of returns and refunds (firm note)", kind: "CIRCULAR", serviceLine: "DIRECT_TAX", tags: ["ITR", "refund"], by: "imran.shaikh",
    body: "Firm note: the CBDT has issued instructions on processing of returns and refunds. What to do: check the refund status of clients with pending refunds and respond to any adjustment intimation within the time stated in it. Details, conditions and any time limits are in the official circular." },
  { title: "TDS returns: correcting a short deduction default", kind: "SOP", serviceLine: "DIRECT_TAX", tags: ["TDS"], links: ["TDS-26Q", "TDS-24Q"], by: "rohan.iyer",
    body: "Download the justification report from TRACES, identify the deductee rows, and file a correction statement with the right PAN / section. Record the token number on the correction task. Interest and fee amounts come from the TRACES demand, never from memory." },
  { title: "Statutory audit: engagement file index", kind: "SOP", serviceLine: "AUDIT", tags: ["audit", "working papers"], links: ["STAT-AUDIT"], by: "arvind.mehta",
    body: "Every audit file follows the same index: engagement letter and independence, planning and materiality, risk assessment, controls, substantive testing by area, completion and representation letter, report and UDIN. Upload working papers to the engagement's folder; the completion report pulls review points and the UDIN automatically." },
  { title: "ROC annual filing: AGM date drives AOC-4 and MGT-7", kind: "SOP", serviceLine: "COMPANY_LAW", tags: ["ROC", "AGM"], links: ["AOC-4", "MGT-7"], by: "kavita.rao",
    body: "Record the AGM date on the client as soon as it is held. The AOC-4 and MGT-7 tasks then switch from a provisional date to the computed one. Keep the board and AGM minutes in the engagement folder." },
  { title: "Notification summary: company law forms on the new portal (firm note)", kind: "NOTIFICATION", serviceLine: "COMPANY_LAW", tags: ["ROC", "MCA"], by: "kavita.rao",
    body: "Firm note: certain forms have moved to the new MCA portal version. Impact: DSC re-association may be needed; check before the filing week. See the official MCA notice for the list of forms and dates." },
  { title: "Payroll statutory: PF and ESI monthly routine", kind: "SOP", serviceLine: "ACCOUNTING", tags: ["PF", "ESI", "payroll"], links: ["PF-ECR", "ESI-RET"], by: "rohan.iyer",
    body: "Get the payroll register and joiner / exit list by the first working day, prepare the ECR and ESI return, send the challan to the client for payment, and record the TRRN / challan number. Contribution rates come from the statutory settings table only." },
  { title: "How do I correct a locked week's time entry?", kind: "FAQ", serviceLine: null, tags: ["FAQ", "work entry"], by: "suresh.pillai",
    body: "Weeks lock on Sunday afternoon. Open the entry in My week and choose 'Request correction', say what should change and why. Your Manager (or Partner) approves it, and the change is applied with the original kept in the audit trail." },
  { title: "Client onboarding: KYC and conflict check", kind: "SOP", serviceLine: "ADVISORY", tags: ["onboarding", "KYC"], by: "arvind.mehta",
    body: "Before accepting a new client: collect PAN, constitution documents and authorised signatory details; run the conflict check in CRM; for audits, communicate with the previous auditor. The engagement letter goes out only after the Partner approves the proposal." },
  { title: "Using comments and @mentions instead of WhatsApp", kind: "FAQ", serviceLine: null, tags: ["FAQ", "comments"], by: "suresh.pillai",
    body: "Every task, engagement, notice and lead has a comment thread. Type @ and a colleague's name to mention them — they get a notification with a link back to the record. Only people who can see the record can be mentioned. You can edit your comment for 15 minutes and delete it any time." },
];

export async function seedCollabDemo() {
  const today = todayIst();
  const partner = await actor("arvind.mehta");
  const partner2 = await actor("kavita.rao");
  const pa = await actor("suresh.pillai");
  const hr = await actor("lakshmi.narayanan");

  // Knowledge base (15 articles) + links + "read by" via Knowledge Updates entries.
  const articleIds: string[] = [];
  for (const a of ARTICLES) {
    const by = await actor(a.by);
    const author = by.role === "STAFF" || by.role === "ARTICLE" ? pa : by;
    const row = await createArticle(author, { title: a.title, body: a.body, kind: a.kind, serviceLine: a.serviceLine, tags: a.tags, sourceRef: a.kind === "CIRCULAR" || a.kind === "NOTIFICATION" ? "See the official circular / notification" : "" });
    articleIds.push(row.id);
    for (const code of a.links ?? []) await safe(() => linkArticle(pa, row.id, "COMPLIANCE_TYPE", code));
  }
  const ext = await db().extension.findFirst({ where: { status: "PUBLISHED" } });
  if (ext) await safe(() => linkArticle(pa, articleIds[4]!, "EXTENSION", ext.id));
  const ku = await db().internalCategory.findFirst({ where: { code: "KNOWLEDGE_UPDATES" } });
  if (ku) {
    const readers = ["priya.nair", "neha.gupta", "karthik.reddy", "vikram.singh", "aditya.kumar", "meera.pillai", "ananya.das"];
    for (const [i, username] of readers.entries()) {
      const userId = await uid(username);
      for (const j of [0, 2, 5, 7, 12].slice(0, 2 + (i % 4))) {
        await db().workEntry.create({ data: { userId, date: addDays(today, -(3 + i + j)), internalCategoryId: ku.id, minutes: 30, description: `Read: ${ARTICLES[j]!.title}`, knowledgeArticleId: articleIds[j]!, createdById: userId } });
      }
    }
  }

  // Applause (~25), Partners and Managers only, Managers to their own team.
  const senders = ["arvind.mehta", "kavita.rao", "rohan.iyer", "sneha.kulkarni", "imran.shaikh"];
  const messages = [
    "Got the GSTR-3B batch filed two days early despite late data from the client.",
    "Review came back with zero points — very clean working papers.",
    "The client called specifically to thank you for the quick notice reply.",
    "Picked up TDS correction statements in a week. Impressive.",
    "Stayed back to help the team close the audit file on time.",
    "Found the reconciliation gap nobody else could spot.",
  ];
  let n = 0;
  for (let round = 0; round < 5; round += 1) {
    for (const s of senders) {
      const from = await actor(s);
      const people = (await applaudablePeople(from)).filter((p) => ["STAFF", "ARTICLE", "MANAGER"].includes(p.role));
      if (!people.length) continue;
      const to = people[(round * 3 + n) % people.length]!;
      const badge = BADGES[(round + n) % BADGES.length]!;
      const row = await safe(() => giveApplause(from, { toUserId: to.id, badgeCode: badge.code, message: messages[(round + n) % messages.length]! }));
      if (row) await db().applause.update({ where: { id: row.id }, data: { createdAt: new Date(Date.now() - (n * 6 + 1) * 86_400_000) } });
      n += 1;
    }
  }

  // Helpdesk: 12 tickets in mixed states, incl. HR queries and one converted to an FAQ.
  const T = async (username: string, category: "BUG" | "HOW_DO_I" | "DATA_CORRECTION" | "ACCESS" | "HR_QUERY" | "OTHER", subject: string, description: string, hrTopic?: "PAYSLIP" | "LEAVE_BALANCE" | "REIMBURSEMENT") =>
    raiseTicket(await actor(username), { category, subject, description, hrTopic });
  const t1 = await T("neha.gupta", "HOW_DO_I", "How do I log time for a client meeting?", "I attended a client meeting for two hours. Which category or task should I log it against?");
  await replyToTicket(pa, t1.id, { body: "Log it against the client's engagement (or the task discussed) and add 'meeting' in the description. If it was internal, use Internal Meeting." });
  await setTicketStatus(pa, t1.id, "RESOLVED");
  await setTicketStatus(await actor("neha.gupta"), t1.id, "CLOSED");
  await convertToFaq(pa, t1.id, { title: "How do I log time for a client meeting?", body: "Log it against the client's engagement (or the specific task discussed) and mention 'meeting' in the description. Internal meetings go under the Internal Meeting category." });
  const t2 = await T("karthik.reddy", "BUG", "Calendar does not show a hearing date", "The hearing I added for a notice yesterday is not on my calendar view.");
  await assignTicket(pa, t2.id, pa.userId);
  await replyToTicket(pa, t2.id, { body: "Checked: the notice is assigned to Priya, so it appears on her personal layer. Will confirm if it should show for the team.", internal: true });
  const t3 = await T("pooja.joshi", "ACCESS", "Cannot see the new client's engagement", "I was told to work on the GST returns of a new client but I cannot open the engagement.");
  await replyToTicket(pa, t3.id, { body: "Your Manager needs to assign you to the engagement. I have asked Sneha to do it." });
  await setTicketStatus(pa, t3.id, "RESOLVED");
  const t4 = await T("aditya.kumar", "HR_QUERY", "Stipend for last month not in payslip", "My payslip for last month does not show the stipend increase that was approved.", "PAYSLIP");
  await assignTicket(hr, t4.id, hr.userId);
  await replyToTicket(hr, t4.id, { body: "Checking with payroll. The revision was approved after the payroll cut-off; it will be paid as arrears.", internal: false });
  await replyToTicket(hr, t4.id, { body: "Arrears to be included in this month's run — confirm with Partner at approval.", internal: true });
  const t5 = await T("meera.pillai", "HR_QUERY", "Leave balance looks lower than expected", "My earned leave balance shows two days fewer than I calculated.", "LEAVE_BALANCE");
  await replyToTicket(hr, t5.id, { body: "Two half-days of sick leave were taken in July; they were adjusted against earned leave as per policy. Details sent on your leave page." });
  await setTicketStatus(hr, t5.id, "RESOLVED");
  await setTicketStatus(await actor("meera.pillai"), t5.id, "OPEN");
  await T("vikram.singh", "HR_QUERY", "Reimbursement of client-site travel", "I submitted a conveyance claim for site visits three weeks ago; it still shows pending.", "REIMBURSEMENT");
  const t7 = await T("rahul.verma", "DATA_CORRECTION", "Wrong PAN on a director record", "The PAN shown for one of the directors of a company client has two characters swapped.");
  await assignTicket(pa, t7.id, pa.userId);
  await replyToTicket(pa, t7.id, { body: "Corrected in the director master; the change is in the audit trail." });
  await setTicketStatus(pa, t7.id, "RESOLVED");
  await setTicketStatus(pa, t7.id, "CLOSED");
  const t8 = await T("ananya.das", "HOW_DO_I", "How to record a DSC handed to the client?", "The client took their DSC back after the filing. Where do I record this?");
  await replyToTicket(pa, t8.id, { body: "Open the DSC register, choose the DSC and 'Record movement' with custody = Client." });
  const t9 = await T("siddharth.menon", "OTHER", "Printer on the second floor", "The second-floor printer jams on every second page.");
  await setTicketStatus(pa, t9.id, "IN_PROGRESS");
  const t10 = await T("harsh.patel", "BUG", "Offline entry did not sync", "I logged two entries on the train; one of them did not appear after I came online.");
  await db().helpdeskTicket.update({ where: { id: t10.id }, data: { createdAt: new Date(Date.now() - 12 * 86_400_000) } });
  const t11 = await T("divya.krishnan", "ACCESS", "Two-factor app lost after phone change", "I changed my phone and cannot generate login codes any more.");
  await assignTicket(partner, t11.id, pa.userId);
  await replyToTicket(pa, t11.id, { body: "Reset your two-factor enrolment; please set it up again on the new phone at your next login." });
  await setTicketStatus(pa, t11.id, "RESOLVED");
  await setTicketStatus(await actor("divya.krishnan"), t11.id, "CLOSED");
  const t12 = await T("faizan.ali", "HOW_DO_I", "Where are the GST SOPs?", "Is there a checklist for GSTR-3B I can follow?");
  await replyToTicket(pa, t12.id, { body: "Yes — see 'GSTR-3B: firm checklist before filing' in the Knowledge base." });
  await setTicketStatus(pa, t12.id, "RESOLVED");
  await db().helpdeskTicket.update({ where: { id: t2.id }, data: { createdAt: new Date(Date.now() - 9 * 86_400_000) } });

  // Comments with @mentions on a few tasks.
  const rohan = await actor("rohan.iyer");
  const priya = await actor("priya.nair");
  const priyaTasks = await db().task.findMany({
    where: { status: { in: ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT"] }, assignments: { some: { userId: priya.userId, toDate: null } } },
    orderBy: { effectiveDueDate: "asc" },
    take: 4,
  });
  for (const [i, t] of priyaTasks.entries()) {
    await safe(() => addComment(rohan, { entityType: "TASK", entityId: t.id, body: i % 2 ? "@priya.nair the client says the sales data is final now — please pick it up today." : "@priya.nair please check the ITC reversal workings before we send the summary." }));
    await safe(() => addComment(priya, { entityType: "TASK", entityId: t.id, body: i % 2 ? "On it. @rohan.iyer will need your review by Thursday." : "Done — two invoices need the client's confirmation. @rohan.iyer FYI." }));
  }
  const notice = await db().notice.findFirst({ where: { status: { not: "CLOSED" }, assigneeId: { not: null } } });
  if (notice) {
    const assignee = await db().user.findUnique({ where: { id: notice.assigneeId! } });
    if (assignee) await safe(() => addComment(partner, { entityType: "NOTICE", entityId: notice.id, body: `@${assignee.username} please share the draft reply with me two days before the due date.` }));
  }

  // Client meetings: 6, past ones held with minutes and action items that became tasks.
  const managerClients = await db().client.findMany({ where: { isFirm: false, managerId: { in: [rohan.userId, (await actor("sneha.kulkarni")).userId] }, contacts: { some: {} } }, include: { contacts: true }, take: 6 });
  const plan = [
    { days: -21, title: "Quarterly review of GST compliance", held: true },
    { days: -10, title: "Audit planning meeting", held: true },
    { days: -4, title: "Notice discussion and document list", held: true },
    { days: 2, title: "Tax planning before advance tax instalment", held: false },
    { days: 6, title: "Board meeting preparation", held: false },
    { days: 13, title: "Engagement renewal discussion", held: false },
  ];
  for (const [i, c] of managerClients.entries()) {
    const p = plan[i]!;
    const org = c.managerId === rohan.userId ? rohan : await actor("sneha.kulkarni");
    const team = await db().engagementAssignment.findMany({ where: { engagement: { clientId: c.id }, toDate: null }, select: { userId: true }, take: 2 });
    const m = await safe(() => scheduleMeeting(org, {
      clientId: c.id, title: p.title, scheduledAt: `${addDays(today, p.days)}T${i % 2 ? "15:30" : "11:00"}`, durationMinutes: 60, location: i % 2 ? "Client office" : "QEPEX office, Jaipur",
      agenda: "1. Status of open filings\n2. Documents pending from the client\n3. Next steps", userIds: team.map((x) => x.userId), contactIds: c.contacts.slice(0, 2).map((x) => x.id),
    }));
    if (!m || !p.held) continue;
    await updateMeeting(org, m.id, { status: "HELD", notes: `Minutes — ${p.title}\n\n• Reviewed open filings; client to send pending documents this week.\n• Agreed the review timetable.\n• Client asked for a note on the recent circular (see Knowledge base).` });
    const owner = team[0]?.userId ?? org.userId;
    await safe(() => addActionItem(org, m.id, { title: `Send document request list to ${c.name}`, ownerId: owner, dueDate: addDays(today, 3 + i) }));
    await safe(() => addActionItem(org, m.id, { title: `Prepare summary note for ${c.name}`, ownerId: org.userId, dueDate: addDays(today, 7 + i) }));
  }

  // Three archived engagements (completion reports are built on demand from their records).
  const candidates = await db().engagement.findMany({ where: { archivedAt: null, status: "ACTIVE", recurrence: "ONE_TIME", client: { isFirm: false } }, include: { client: true }, orderBy: { code: "asc" }, take: 3 });
  for (const e of candidates) {
    const closer = e.client.partnerId === partner2.userId ? partner2 : partner;
    await safe(() => closeEngagement(closer, e.id, { overrideReason: "Demo: work completed; remaining items handled outside the engagement" }));
    await db().engagement.update({ where: { id: e.id }, data: { archivedAt: new Date(Date.now() - 20 * 86_400_000), closedAt: new Date(Date.now() - 20 * 86_400_000) } });
  }

  // Firm's own compliance: firm-only obligations with typed due dates.
  await ensureFirmClient(partner);
  const fy = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0);
  const fyl = `${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;
  const firmItems: [string, string, string, string][] = [
    ["FIRM-PI-INSURANCE", fyl, addDays(today, 45), "Policy schedule — renewal date"],
    ["FIRM-ICAI-COP", `Arvind Mehta ${fyl}`, addDays(today, 70), "As per the Institute's announcement"],
    ["FIRM-ICAI-COP", `Kavita Rao ${fyl}`, addDays(today, 70), "As per the Institute's announcement"],
    ["FIRM-PEER-REVIEW", "Current certificate", addDays(today, 200), "Validity date on the certificate"],
    ["FIRM-OFFICE-LICENCE", `Jaipur office ${fyl}`, addDays(today, 20), "Licence renewal date"],
  ];
  const firmOwner = await uid("rohan.iyer");
  for (const [typeCode, periodLabel, dueDate, note] of firmItems) {
    await safe(() => recordFirmObligation(partner, { typeCode, periodLabel, dueDate, note, ownerId: firmOwner }));
  }
}
