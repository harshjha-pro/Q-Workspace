import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeClient, makeUser } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { mergeDataFor, renderMerge } from "@/server/documents/merge";
import { addDays, todayIst } from "@/server/lib/dates";
import { seedCrmReference } from "@/prisma/seed/phase3/crm";
import { createLead, updateLead, setLeadStage, addLeadActivity, listLeads, getLead, leadHours, findDuplicates, runLeadFollowUps } from "@/server/services/crm/leads";
import { createProposal, updateProposal, approveProposal, markProposalSent, decideProposal, runProposalExpiry, getProposal, proposalPdf } from "@/server/services/crm/proposals";
import { suggestBudgetMinutes, engagementSpecFor, saveServiceTemplate } from "@/server/services/crm/templates";
import { generateLetter, acceptLetterWithSignedCopy, letterFile, getLetter } from "@/server/services/crm/letters";
import { getOnboarding, setOnboardingItem, attachOnboardingDocument, decideConflict, startOnboarding } from "@/server/services/crm/onboarding";
import { runCrossSell, listOpportunities, convertOpportunity, evaluateCrossSell } from "@/server/services/crm/crosssell";
import { runRenewals, listRenewals, approveRenewal, generateRenewalLetter, feeSuggestion } from "@/server/services/crm/renewals";
import { runFeedbackRequests, recordFeedback, listFeedback } from "@/server/services/crm/feedback";
import { createCampaign, buildRecipients, getCampaign, markRecipientsSent, campaignCsv } from "@/server/services/crm/campaigns";
import { logClientCommunication, getClientCommunications, keyDates, setContactOptOut } from "@/server/services/crm/communications";

let w: Awaited<ReturnType<typeof buildWorld>>;
const today = todayIst();
const PDF = Buffer.from("%PDF-1.4\n% signed copy\n");

async function setSetting(key: string, value: unknown) {
  await db().setting.upsert({ where: { key }, create: { key, valueJson: JSON.stringify(value) }, update: { valueJson: JSON.stringify(value) } });
}
const template = (name: string) => db().serviceTemplate.findFirstOrThrow({ where: { name } });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await seedCrmReference(db());
  await db().client.update({ where: { id: w.c1.id }, data: { pan: "AAACX1234A" } });
  await db().contact.create({ data: { clientId: w.c1.id, name: "Ravi Accounts", email: "ravi@c1.example.com", phone: "9820012345", isPrimary: true } });
});

describe("leads: duplicates, stages, scope (P3-08)", () => {
  it("warns on a PAN that belongs to a client and saves only with an override reason", async () => {
    await expect(createLead(actorOf(w.m1), { name: "C1 again", pan: "AAACX1234A" })).rejects.toThrow(/Possible duplicate.*Client/);
    const lead = await createLead(actorOf(w.m1), { name: "C1 again", pan: "AAACX1234A", overrideReason: "Sister concern enquiry, verified" });
    expect(lead.ownerId).toBe(w.m1.id);
    expect(lead.notes).toMatch(/overridden/);
    const audit = await db().auditLog.findFirstOrThrow({ where: { entityType: "Lead", entityId: lead.id, action: "CREATE" } });
    expect(audit.reason).toMatch(/Duplicate override/);
  });

  it("matches on phone (any format) and GSTIN-embedded PAN; names hidden outside scope", async () => {
    const m = await findDuplicates(actorOf(w.m1), { phone: "+91 98200 12345" });
    expect(m.some((x) => x.kind === "CLIENT" && x.id === w.c1.id && x.matchedOn.includes("phone"))).toBe(true);
    const g = await findDuplicates(actorOf(w.m1), { gstin: "27AAACX1234A1Z5" });
    expect(g.some((x) => x.kind === "CLIENT" && x.matchedOn.includes("PAN in GSTIN"))).toBe(true);
    const other = await findDuplicates(actorOf(w.m2), { pan: "AAACX1234A" });
    expect(other.find((x) => x.kind === "CLIENT")!.label).toBe("An existing client outside your team");
    expect(other.find((x) => x.kind === "CLIENT")!.visible).toBe(false);
  });

  it("referral needs a referrer; owner must be a Partner or Manager", async () => {
    await expect(createLead(actorOf(w.m1), { name: "Ref lead", source: "REFERRAL" })).rejects.toThrow(/referred/);
    await expect(createLead(actorOf(w.m1), { name: "Ref lead", ownerId: w.s1.id })).rejects.toThrow(/Partner or Manager/);
  });

  it("enforces stage rules: lost needs a reason, won needs a client, won is final", async () => {
    const l = await createLead(actorOf(w.m1), { name: "Stage Test Traders", email: "stage@example.com" });
    await expect(setLeadStage(actorOf(w.m1), l.id, { stage: "LOST" })).rejects.toThrow(/reason/);
    await setLeadStage(actorOf(w.m1), l.id, { stage: "LOST", lostReason: "Fee too high" });
    expect((await db().lead.findUniqueOrThrow({ where: { id: l.id } })).lostReason).toBe("Fee too high");
    await setLeadStage(actorOf(w.m1), l.id, { stage: "CONTACTED" });
    expect((await db().lead.findUniqueOrThrow({ where: { id: l.id } })).lostReason).toBeNull();
    await expect(setLeadStage(actorOf(w.m1), l.id, { stage: "WON" })).rejects.toThrow(/engagement letter/);
  });

  it("activity moves New → Contacted, sets the follow-up; the job notifies the owner once", async () => {
    const l = await createLead(actorOf(w.m1), { name: "Followup Foods", phone: "9000000001" });
    await addLeadActivity(actorOf(w.m1), l.id, { kind: "CALL", date: today, notes: "Intro call", nextFollowUp: today });
    const after = await db().lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(after.stage).toBe("CONTACTED");
    expect(after.nextFollowUp).toBe(today);
    const r1 = await runLeadFollowUps(today);
    const r2 = await runLeadFollowUps(today);
    expect(r1.notified).toBeGreaterThanOrEqual(1);
    expect(r2.notified).toBe(0);
    expect(await db().notification.count({ where: { userId: w.m1.id, kind: "LEAD_FOLLOW_UP", entityId: l.id } })).toBe(1);
  });

  it("scopes leads: other Manager cannot see; Staff sees only leads they worked on, without fees; Article/HR denied", async () => {
    const l = await createLead(actorOf(w.m1), { name: "Scoped Lead LLP", estFeePaise: 50_000_00 });
    expect((await listLeads(actorOf(w.m2))).some((x) => x.id === l.id)).toBe(false);
    await expect(getLead(actorOf(w.m2), l.id)).rejects.toThrow();
    expect(await listLeads(actorOf(w.s1))).toHaveLength(0);
    const bd = await db().internalCategory.findFirstOrThrow({ where: { code: "BUSINESS_DEVELOPMENT" } });
    await db().workEntry.create({ data: { userId: w.s1.id, date: today, internalCategoryId: bd.id, leadId: l.id, minutes: 90 } });
    await db().workEntry.create({ data: { userId: w.m1.id, date: today, internalCategoryId: bd.id, leadId: l.id, minutes: 60 } });
    const staffView = await listLeads(actorOf(w.s1));
    expect(staffView.map((x) => x.id)).toEqual([l.id]);
    expect(staffView[0]!.estFeePaise).toBe(0);
    expect((await leadHours(l.id)).totalMinutes).toBe(150);
    await expect(createLead(actorOf(w.s1), { name: "Staff lead" })).rejects.toThrow();
    await expect(listLeads(actorOf(w.a1))).rejects.toThrow();
    await expect(listLeads(actorOf(w.hr))).rejects.toThrow();
    expect((await listLeads(actorOf(w.pa))).some((x) => x.id === l.id)).toBe(true);
    await expect(updateLead(actorOf(w.m2), l.id, { notes: "x" })).rejects.toThrow();
  });
});

describe("proposals: approval limits, versioning, expiry (P3-09)", () => {
  let leadId: string;
  it("builds from a template with a budget suggestion; Manager approval only within the limit", async () => {
    const lead = await createLead(actorOf(w.m1), { name: "Proposal Industries Private Limited", entityType: "PRIVATE_COMPANY", pan: "AAACP5555K", contactName: "Meena", email: "meena@prop.example.com", phone: "9811111111" });
    leadId = lead.id;
    const p = await createProposal(actorOf(w.m1), { leadId, serviceTemplateId: (await template("Statutory audit")).id });
    expect(p.status).toBe("DRAFT");
    expect(p.budgetMinutes).toBe(150 * 60); // template placeholder, no past actuals yet
    expect(p.feePaise).toBe(1_50_000_00);
    await expect(approveProposal(actorOf(w.m1), p.id)).rejects.toThrow(/Partner/);
    await setSetting("crm.proposalApprovalLimitPaise", 1_00_000_00);
    await expect(approveProposal(actorOf(w.m1), p.id)).rejects.toThrow(/approval limit/);
    await updateProposal(actorOf(w.m1), p.id, { feePaise: 90_000_00 });
    const ok = await approveProposal(actorOf(w.m1), p.id);
    expect(ok.status).toBe("APPROVED");
    await setSetting("crm.proposalApprovalLimitPaise", 0);
  });

  it("editing an approved proposal creates a new draft version and supersedes the old", async () => {
    const [p1] = await db().proposal.findMany({ where: { leadId, status: "APPROVED" } });
    const v2 = await updateProposal(actorOf(w.m1), p1!.id, { feePaise: 1_20_000_00 });
    expect(v2.version).toBe(2);
    expect(v2.parentId).toBe(p1!.id);
    expect(v2.status).toBe("DRAFT");
    expect((await db().proposal.findUniqueOrThrow({ where: { id: p1!.id } })).status).toBe("SUPERSEDED");
    await expect(markProposalSent(actorOf(w.m1), v2.id)).rejects.toThrow(/approved/);
    await expect(approveProposal(actorOf(w.m1), v2.id)).rejects.toThrow();
    await approveProposal(actorOf(w.partner), v2.id);
    await markProposalSent(actorOf(w.m1), v2.id);
    expect((await db().lead.findUniqueOrThrow({ where: { id: leadId } })).stage).toBe("PROPOSAL_SENT");
    const view = await getProposal(actorOf(w.partner), v2.id);
    expect(view.versions.map((v) => v.version)).toEqual([1, 2]);
    const pdf = await proposalPdf(actorOf(w.m1), v2.id);
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("fees are hidden: Staff cannot open proposals; another team cannot either", async () => {
    const [p] = await db().proposal.findMany({ where: { leadId, status: "SENT" } });
    await expect(getProposal(actorOf(w.s1), p!.id)).rejects.toThrow();
    await expect(getProposal(actorOf(w.m2), p!.id)).rejects.toThrow();
  });

  it("expired proposals cannot be accepted; the job expires them", async () => {
    const lead = await createLead(actorOf(w.m1), { name: "Expiry Exports", email: "exp@example.com" });
    const p = await createProposal(actorOf(w.m1), { leadId: lead.id, serviceTemplateId: (await template("Tax audit")).id, validUntil: addDays(today, 5) });
    await approveProposal(actorOf(w.partner), p.id);
    await markProposalSent(actorOf(w.m1), p.id);
    expect((await runProposalExpiry(addDays(today, 6))).expired).toBeGreaterThanOrEqual(1);
    expect((await db().proposal.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("EXPIRED");
    await expect(decideProposal(actorOf(w.m1), p.id, { decision: "ACCEPTED" })).rejects.toThrow(/sent/);
  });

  it("suggests budget hours from past actuals of the same engagement type", async () => {
    const c = await makeClient({ teamId: w.t1.id, managerId: w.m1.id });
    const old = await db().engagement.create({ data: { code: "EN-T90001", clientId: c.id, name: "ROC filing FY 2024-25", serviceLine: "COMPANY_LAW", engagementType: "ROC_ANNUAL", status: "COMPLETED", startDate: "2025-04-01" } });
    const old2 = await db().engagement.create({ data: { code: "EN-T90002", clientId: c.id, name: "ROC filing FY 2023-24", serviceLine: "COMPANY_LAW", engagementType: "ROC_ANNUAL", status: "COMPLETED", startDate: "2024-04-01" } });
    await db().workEntry.createMany({ data: [{ userId: w.s1.id, date: "2025-09-01", engagementId: old.id, clientId: c.id, minutes: 600 }, { userId: w.s1.id, date: "2024-09-01", engagementId: old2.id, clientId: c.id, minutes: 1200 }] });
    const s = await suggestBudgetMinutes("ROC_ANNUAL", 0);
    expect(s.minutes).toBe(900);
    expect(s.samples).toBe(2);
    expect(engagementSpecFor("COMPANY_LAW", "ROC annual filing")).toEqual({ engagementType: "ROC_ANNUAL", recurrence: "RECURRING" });
  });

  it("service templates are maintained firm-wide only", async () => {
    await expect(saveServiceTemplate(actorOf(w.m1), { serviceLine: "GST", name: "GST refund" })).rejects.toThrow();
    const t = await saveServiceTemplate(actorOf(w.pa), { serviceLine: "GST", name: "GST refund", timelines: "Estimated effort: 10 hrs" });
    expect(t.active).toBe(true);
  });
});

describe("engagement letter acceptance → client + engagement (P3-10) and onboarding (P3-11)", () => {
  let letterId: string;
  let clientId: string;
  it("generates the letter from the accepted proposal; client not created yet", async () => {
    const p = await db().proposal.findFirstOrThrow({ where: { status: "SENT", lead: { name: "Proposal Industries Private Limited" } } });
    await expect(generateLetter(actorOf(w.m1), p.id)).rejects.toThrow(/accepts/);
    await decideProposal(actorOf(w.m1), p.id, { decision: "ACCEPTED" });
    const { letter } = await generateLetter(actorOf(w.m1), p.id);
    letterId = letter.id;
    expect(letter.clientId.startsWith("LEAD:")).toBe(true);
    expect(letter.body).toContain("Proposal Industries Private Limited");
    expect(letter.body).toContain("Rs. 1,20,000");
    expect(await db().client.count({ where: { pan: "AAACP5555K" } })).toBe(0);
    // A firm template written with {{client.*}} / {{engagement.*}} is filled from the lead and proposal too.
    const data = await mergeDataFor({ clientId: null, fallback: { client: { name: "Proposal Industries Private Limited" }, engagement: { fee: "Rs. 1,20,000" } } });
    const merged = renderMerge("Dear {{client.name}}, fee {{engagement.fee}}", data);
    expect(merged).toEqual({ text: "Dear Proposal Industries Private Limited, fee Rs. 1,20,000", missing: [] });
    const docx = await letterFile(actorOf(w.m1), letterId, "docx");
    expect(docx.body.subarray(0, 2).toString()).toBe("PK");
  });

  it("uploading the signed copy creates the client, the engagement (fee, budget, template, team), onboarding and wins the lead", async () => {
    const r = await acceptLetterWithSignedCopy(actorOf(w.m1), letterId, { name: "signed.pdf", data: PDF }, { memberUserIds: [w.s1.id] });
    clientId = r.clientId;
    const client = await db().client.findUniqueOrThrow({ where: { id: clientId }, include: { contacts: true } });
    expect(client.pan).toBe("AAACP5555K");
    expect(client.constitution).toBe("PRIVATE_COMPANY");
    expect(client.managerId).toBe(w.m1.id);
    expect(client.contacts[0]!.email).toBe("meena@prop.example.com");
    const e = await db().engagement.findUniqueOrThrow({ where: { id: r.engagementId }, include: { assignments: true } });
    expect(e.feePaise).toBe(1_20_000_00);
    expect(e.budgetMinutes).toBe(150 * 60);
    expect(e.engagementType).toBe("AUDIT");
    expect(e.stageTemplateVersionId).not.toBeNull();
    expect(e.engagementLetterId).toBe(letterId);
    expect(e.assignments.some((a) => a.userId === w.s1.id)).toBe(true);
    const lead = await db().lead.findFirstOrThrow({ where: { name: "Proposal Industries Private Limited" } });
    expect(lead.stage).toBe("WON");
    expect(lead.clientId).toBe(clientId);
    const view = await getLetter(actorOf(w.m1), letterId);
    expect(view.letter.status).toBe("SIGNED_UPLOADED");
    expect(view.letter.signedCopyDocumentId).not.toBeNull();
    const ob = await getOnboarding(actorOf(w.m1), clientId);
    expect(ob.items.map((i) => i.code)).toContain("PREV_AUDITOR_NOC"); // audit appointment
    expect(ob.checks).toHaveLength(1);
    await expect(acceptLetterWithSignedCopy(actorOf(w.m1), letterId, { name: "again.pdf", data: PDF })).rejects.toThrow(/already/);
  });

  it("only a Partner decides the conflict check; clearing ticks the checklist item", async () => {
    const ob = await getOnboarding(actorOf(w.m1), clientId);
    const check = ob.checks[0]!;
    await expect(decideConflict(actorOf(w.m1), check.id, { decision: "CLEARED" })).rejects.toThrow();
    await expect(decideConflict(actorOf(w.pa), check.id, { decision: "CLEARED" })).rejects.toThrow();
    await expect(decideConflict(actorOf(w.partner), check.id, { decision: "CLEARED_WITH_SAFEGUARDS" })).rejects.toThrow(/safeguards/);
    await decideConflict(actorOf(w.partner), check.id, { decision: "CLEARED_WITH_SAFEGUARDS", notes: "Separate engagement team" });
    const item = (await getOnboarding(actorOf(w.m1), clientId)).items.find((i) => i.code === "CONFLICT_CHECK")!;
    expect(item.done).toBe(true);
    await expect(setOnboardingItem(actorOf(w.m1), item.id, { done: false })).rejects.toThrow(/Partner/);
  });

  it("NOC needs an attachment; KYC items drive the client's KYC status", async () => {
    const items = (await getOnboarding(actorOf(w.m1), clientId)).items;
    const noc = items.find((i) => i.code === "PREV_AUDITOR_NOC")!;
    await expect(setOnboardingItem(actorOf(w.m1), noc.id, { done: true })).rejects.toThrow(/Attach/);
    await attachOnboardingDocument(actorOf(w.m1), noc.id, { name: "noc.pdf", data: PDF });
    expect((await db().onboardingItem.findUniqueOrThrow({ where: { id: noc.id } })).done).toBe(true);
    await setOnboardingItem(actorOf(w.m1), items.find((i) => i.code === "KYC_PAN")!.id, { done: true });
    expect((await db().client.findUniqueOrThrow({ where: { id: clientId } })).kycStatus).toBe("PARTIAL");
    for (const code of ["KYC_ADDRESS", "KYC_CONSTITUTION", "KYC_SIGNATORY"]) await setOnboardingItem(actorOf(w.m1), items.find((i) => i.code === code)!.id, { done: true });
    expect((await db().client.findUniqueOrThrow({ where: { id: clientId } })).kycStatus).toBe("COMPLETE");
    await expect(setOnboardingItem(actorOf(w.m2), noc.id, { done: true })).rejects.toThrow();
    await expect(getOnboarding(actorOf(w.hr), clientId)).rejects.toThrow();
  });

  it("onboarding can be started for an existing client without audit work (no NOC item)", async () => {
    const list = await startOnboarding(actorOf(w.m2), w.c2.id);
    const items = await db().onboardingItem.findMany({ where: { checklistId: list.id } });
    expect(items.some((i) => i.code === "PREV_AUDITOR_NOC")).toBe(false);
  });
});

describe("cross-sell (P3-13)", () => {
  it("rules are data-driven and pure", () => {
    const base = { constitution: "PRIVATE_COMPANY", gstins: [{ status: "ACTIVE" }], taxAuditApplicable: true, statutoryAuditApplicable: false, tdsApplicable: true, pfApplicable: false, esiApplicable: true };
    const codes = evaluateCrossSell(base, [{ serviceLine: "GST", engagementType: "GST_RETURN", name: "GST" }]).map((r) => r.code);
    expect(codes.sort()).toEqual(["COMPANY_NO_SECRETARIAL", "PAYROLL_NO_ENGAGEMENT", "TAX_AUDIT_NO_ENGAGEMENT", "TDS_NO_ENGAGEMENT"]);
    expect(evaluateCrossSell(base, [{ serviceLine: "AUDIT", engagementType: "AUDIT", name: "Tax audit AY 2026-27" }]).some((r) => r.code === "TAX_AUDIT_NO_ENGAGEMENT")).toBe(false);
  });

  it("creates opportunities idempotently, scoped, and converts one into a lead for the client", async () => {
    await db().client.update({ where: { id: w.c1.id }, data: { tdsApplicable: true } });
    const r1 = await runCrossSell();
    const r2 = await runCrossSell();
    expect(r1.created).toBeGreaterThan(0);
    expect(r2.created).toBe(0);
    const mine = await listOpportunities(actorOf(w.m1));
    const tds = mine.find((o) => o.clientId === w.c1.id && o.ruleCode === "TDS_NO_ENGAGEMENT")!;
    expect(tds).toBeTruthy();
    expect((await listOpportunities(actorOf(w.m2))).some((o) => o.clientId === w.c1.id)).toBe(false);
    await expect(convertOpportunity(actorOf(w.m2), tds.id)).rejects.toThrow();
    const lead = await convertOpportunity(actorOf(w.m1), tds.id);
    expect(lead.clientId).toBe(w.c1.id);
    expect(lead.source).toBe("EXISTING_CLIENT");
    expect((await db().opportunity.findUniqueOrThrow({ where: { id: tds.id } })).status).toBe("CONVERTED");
    // a won-able lead for an existing client may be marked Won directly
    await setLeadStage(actorOf(w.m1), lead.id, { stage: "WON" });
  });
});

describe("renewals (P3-14)", () => {
  it("prompts 60 days before the next period, idempotently; fee suggestion uses hours × cost; Partner approves; letter generated", async () => {
    await db().engagement.update({ where: { id: w.e1.id }, data: { recurrence: "RECURRING", startDate: "2026-04-01", feePaise: 20_000_00 } });
    const desig = await db().designation.create({ data: { name: "CRM test associate" } });
    await db().user.update({ where: { id: w.s1.id }, data: { designationId: desig.id } });
    await db().costRate.create({ data: { designationId: desig.id, ratePaisePerHour: 1_000_00, effectiveFrom: "2026-04-01" } });
    await db().workEntry.create({ data: { userId: w.s1.id, date: "2026-06-01", clientId: w.c1.id, engagementId: w.e1.id, minutes: 30 * 60 } });
    expect((await runRenewals("2026-12-01")).created).toBe(0); // more than 60 days before 1-Apr-2027
    const r1 = await runRenewals("2027-02-15");
    const r2 = await runRenewals("2027-02-16");
    expect(r1.created).toBeGreaterThanOrEqual(1);
    expect(r2.created).toBe(0);
    const ren = await db().renewal.findFirstOrThrow({ where: { engagementId: w.e1.id } });
    expect(ren.periodKey).toBe("FY2027-28");
    expect(ren.dueDate).toBe("2027-04-01");
    expect(ren.lastMinutes).toBe(1800);
    // cost 30 h × ₹1,000 = ₹30,000; +50% markup = ₹45,000 > last fee ₹20,000
    expect(ren.suggestedFeePaise).toBe(45_000_00);
    const e1 = await db().engagement.findUniqueOrThrow({ where: { id: w.e1.id } });
    expect((await feeSuggestion(e1)).realizationPct).toBe(67);
    expect((await listRenewals(actorOf(w.m1))).some((r) => r.id === ren.id)).toBe(true);
    await expect(listRenewals(actorOf(w.s1))).rejects.toThrow();
    await expect(approveRenewal(actorOf(w.m1), ren.id)).rejects.toThrow();
    await expect(generateRenewalLetter(actorOf(w.m1), ren.id)).rejects.toThrow(/approved/);
    await approveRenewal(actorOf(w.partner), ren.id, { feePaise: 40_000_00 });
    const { letter } = await generateRenewalLetter(actorOf(w.m1), ren.id);
    expect(letter.body).toContain("Rs. 40,000");
    expect((await db().renewal.findUniqueOrThrow({ where: { id: ren.id } })).status).toBe("LETTER_ISSUED");
  });
});

describe("feedback (P3-15)", () => {
  it("requests feedback for closed engagements once and alerts the Partner on a low score", async () => {
    await db().engagement.update({ where: { id: w.e2.id }, data: { status: "COMPLETED", closedAt: new Date() } });
    expect((await runFeedbackRequests(today)).created).toBe(1);
    expect((await runFeedbackRequests(today)).created).toBe(0);
    const [f] = await listFeedback(actorOf(w.m2), { pending: true });
    expect(f!.message).toMatch(/1 \(poor\) to 5/);
    expect(await listFeedback(actorOf(w.m1), { pending: true })).toHaveLength(0);
    await expect(recordFeedback(actorOf(w.m2), f!.id, { rating: 6 })).rejects.toThrow();
    await recordFeedback(actorOf(w.m2), f!.id, { rating: 2, comment: "Delays in replies" });
    expect((await db().feedback.findUniqueOrThrow({ where: { id: f!.id } })).alertedAt).not.toBeNull();
    expect(await db().notification.count({ where: { userId: w.partner.id, kind: "FEEDBACK_LOW" } })).toBe(1);
  });
});

describe("contacts, communication log, campaigns (P3-12, P3-16)", () => {
  it("logs communication against client and engagement; key dates in the next 30 days", async () => {
    await logClientCommunication(actorOf(w.s1), w.c1.id, { kind: "WHATSAPP", date: today, notes: "Asked for bank statements", engagementId: w.e1.id });
    await expect(logClientCommunication(actorOf(w.s1), w.c1.id, { kind: "CALL", date: today, notes: "x y", engagementId: w.e2.id })).rejects.toThrow(/engagement/);
    await expect(logClientCommunication(actorOf(w.s2), w.c1.id, { kind: "CALL", date: today, notes: "hello" })).rejects.toThrow();
    const view = await getClientCommunications(actorOf(w.m1), w.c1.id);
    expect(view.activities[0]!.engagementId).toBe(w.e1.id);
    await db().contact.updateMany({ where: { clientId: w.c1.id }, data: { birthday: `1980-${addDays(today, 5).slice(5)}` } });
    await db().client.update({ where: { id: w.c1.id }, data: { incorporationDate: `2010-${addDays(today, 10).slice(5)}` } });
    const dates = await keyDates(actorOf(w.m1), 30, today);
    expect(dates.some((d) => d.kind === "BIRTHDAY" && d.date === addDays(today, 5))).toBe(true);
    expect(dates.find((d) => d.kind === "INCORPORATION")?.years).toBeGreaterThan(0);
    expect((await keyDates(actorOf(w.m2), 30, today)).some((d) => d.clientId === w.c1.id)).toBe(false);
  });

  it("builds recipients from a segment, respects opt-out, exports CSV, marks sent; Manager limited to team clients", async () => {
    const c3 = await makeClient({ teamId: w.t1.id, managerId: w.m1.id, name: "Opted Out Pvt Ltd" });
    const out = await db().contact.create({ data: { clientId: c3.id, name: "No Mail", email: "no@example.com", isPrimary: true } });
    await setContactOptOut(actorOf(w.m1), out.id, true);
    await db().contact.create({ data: { clientId: w.c2.id, name: "C2 Owner", email: "c2@example.com", isPrimary: true } });
    const camp = await createCampaign(actorOf(w.m1), { name: "Diwali greetings", messageText: "Dear {name}, warm Diwali wishes to {client}!", segment: { primaryOnly: true } });
    const built = await buildRecipients(actorOf(w.m1), camp.id);
    expect(built.skippedOptOut).toBe(1);
    const view = await getCampaign(actorOf(w.m1), camp.id);
    expect(view.recipients.some((r) => r.clientId === w.c2.id)).toBe(false); // other team
    expect(view.recipients.some((r) => r.contactId === out.id)).toBe(false);
    const ravi = view.recipients.find((r) => r.clientId === w.c1.id)!;
    expect(ravi.message).toContain("Dear Ravi Accounts");
    const csv = (await campaignCsv(actorOf(w.m1), camp.id)).body.toString("utf8");
    expect(csv).toContain("Ravi Accounts");
    expect(csv).not.toContain("No Mail");
    // opting out after the list was built: refused when marking
    await setContactOptOut(actorOf(w.m1), ravi.contactId!, true);
    await expect(markRecipientsSent(actorOf(w.m1), camp.id, ravi.id)).rejects.toThrow(/opted out/);
    await setContactOptOut(actorOf(w.m1), ravi.contactId!, false);
    const r = await markRecipientsSent(actorOf(w.m1), camp.id);
    expect(r.marked).toBeGreaterThanOrEqual(1);
    expect((await db().campaign.findUniqueOrThrow({ where: { id: camp.id } })).status).toBe("DONE");
    await expect(getCampaign(actorOf(w.m2), camp.id)).rejects.toThrow();
    await expect(createCampaign(actorOf(w.s1), { name: "Staff camp", messageText: "Hello everyone there" })).rejects.toThrow();
    const pc = await createCampaign(actorOf(w.partner), { name: "Firm update", messageText: "Due date extended — details inside" });
    const b2 = await buildRecipients(actorOf(w.partner), pc.id);
    expect(b2.recipients).toBeGreaterThanOrEqual(2);
  });

  it("Article and HR have no CRM access at all", async () => {
    const hrUser = await makeUser("HR_ADMIN");
    await expect(getClientCommunications(actorOf(hrUser), w.c1.id)).rejects.toThrow();
    await expect(listOpportunities(actorOf(w.a1))).rejects.toThrow();
    await expect(keyDates(actorOf(w.hr))).rejects.toThrow();
  });
});
