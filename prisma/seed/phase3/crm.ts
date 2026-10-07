/**
 * CRM seed (spec 10, P3-08 … P3-16).
 * Reference: service templates (scope / deliverables / timelines / fee basis). Fees and the
 * "Estimated effort" hours are firm placeholders to be replaced by the firm — not statutory values.
 * Demo: leads across stages (some duplicating existing clients by PAN), activities, proposals,
 * engagement letters (one accepted → client + engagement), cross-sell opportunities, renewals,
 * feedback (one low score) and a campaign — all created through the CRM services.
 */
import type { PrismaClient } from "../../../generated/prisma/client";

type T = { serviceLine: string; name: string; scope: string; deliverables: string; timelines: string; feeBasis: string; defaultFeePaise: number; oopTerms: string };
const OOP = "Government fees, challans, stamp duty and travel outside the city are billed at actuals.";

export const SERVICE_TEMPLATES: T[] = [
  {
    serviceLine: "GST", name: "GST returns (monthly / QRMP)",
    scope: "Preparation and filing of GSTR-1 and GSTR-3B for each GSTIN; reconciliation of input tax credit with GSTR-2B; computation of tax payable and challan preparation.",
    deliverables: "Filed returns with acknowledgment (ARN); monthly ITC reconciliation statement; tax payable working.",
    timelines: "Within the statutory due dates, provided data is received by the 5th of the following month.\nEstimated effort: 60 hrs (placeholder)",
    feeBasis: "RETAINER", defaultFeePaise: 30_000_00, oopTerms: OOP,
  },
  {
    serviceLine: "DIRECT_TAX", name: "Income tax return (ITR)",
    scope: "Computation of total income, reconciliation with Form 26AS / AIS / TIS, preparation and e-filing of the income tax return and e-verification support.",
    deliverables: "Computation of income; filed ITR with acknowledgment.",
    timelines: "Within the due date for the assessment year, provided documents are received at least 15 days before.\nEstimated effort: 8 hrs (placeholder)",
    feeBasis: "FIXED", defaultFeePaise: 7_500_00, oopTerms: OOP,
  },
  {
    serviceLine: "DIRECT_TAX", name: "TDS returns (quarterly)",
    scope: "Computation of TDS, challan preparation, filing of quarterly TDS statements (24Q / 26Q / 27Q as applicable) and issue of TDS certificates.",
    deliverables: "Filed TDS statements with token numbers; Form 16 / 16A downloads.",
    timelines: "Within the quarterly due dates, provided data is received by the 10th of the month following the quarter.\nEstimated effort: 32 hrs (placeholder)",
    feeBasis: "RETAINER", defaultFeePaise: 24_000_00, oopTerms: OOP,
  },
  {
    serviceLine: "AUDIT", name: "Statutory audit",
    scope: "Audit of the financial statements in accordance with the Standards on Auditing and the applicable law, and reporting thereon.",
    deliverables: "Independent auditor's report (with CARO where applicable); management letter on observations.",
    timelines: "Fieldwork and report within the period agreed after the books are closed.\nEstimated effort: 150 hrs (placeholder)",
    feeBasis: "FIXED", defaultFeePaise: 1_50_000_00, oopTerms: OOP,
  },
  {
    serviceLine: "AUDIT", name: "Tax audit",
    scope: "Audit of accounts under the Income-tax Act and preparation of the tax audit report in the prescribed form.",
    deliverables: "Tax audit report uploaded on the income tax portal with UDIN.",
    timelines: "Before the due date of the tax audit report.\nEstimated effort: 45 hrs (placeholder)",
    feeBasis: "FIXED", defaultFeePaise: 50_000_00, oopTerms: OOP,
  },
  {
    serviceLine: "COMPANY_LAW", name: "ROC annual filing",
    scope: "Preparation of annual return and financial statement filings with the Registrar of Companies, board / AGM documentation support and statutory registers update.",
    deliverables: "Filed annual forms with SRN; minutes and notices drafts.",
    timelines: "Within the statutory time after the AGM.\nEstimated effort: 20 hrs (placeholder)",
    feeBasis: "FIXED", defaultFeePaise: 35_000_00, oopTerms: OOP,
  },
  {
    serviceLine: "ACCOUNTING", name: "Bookkeeping (monthly)",
    scope: "Recording of sales, purchases, expenses, bank and payroll entries; bank reconciliation; monthly MIS.",
    deliverables: "Updated books of account; monthly MIS pack; bank reconciliation statements.",
    timelines: "Books updated by the 10th of the following month.\nEstimated effort: 200 hrs (placeholder)",
    feeBasis: "RETAINER", defaultFeePaise: 96_000_00, oopTerms: OOP,
  },
  {
    serviceLine: "ACCOUNTING", name: "Payroll compliance (PF / ESI / PT)",
    scope: "Monthly PF, ESI and professional tax computation, challans and returns for the employees on the payroll.",
    deliverables: "Challans and returns filed each month; annual returns.",
    timelines: "Within the monthly statutory due dates, provided payroll data is received by the 5th.\nEstimated effort: 36 hrs (placeholder)",
    feeBasis: "RETAINER", defaultFeePaise: 36_000_00, oopTerms: OOP,
  },
  {
    serviceLine: "ADVISORY", name: "Advisory / project (one-time)",
    scope: "Advisory assignment as agreed — e.g. project report, valuation, FEMA review or registrations.",
    deliverables: "Report / filings as agreed in the scope.",
    timelines: "As agreed for the assignment.\nEstimated effort: 40 hrs (placeholder)",
    feeBasis: "TIME", defaultFeePaise: 2_500_00, oopTerms: OOP,
  },
];

/** Idempotent: a template is matched by service line + name and never overwritten once the firm edits it. */
export async function seedCrmReference(db: PrismaClient) {
  for (const t of SERVICE_TEMPLATES) {
    const existing = await db.serviceTemplate.findFirst({ where: { serviceLine: t.serviceLine, name: t.name } });
    if (!existing) await db.serviceTemplate.create({ data: { ...t, createdById: "system" } });
  }
}

/* eslint-disable max-lines-per-function */
export async function seedCrmDemo() {
  const { db } = await import("../../../server/lib/db");
  const { addDays, todayIst } = await import("../../../server/lib/dates");
  const leads = await import("../../../server/services/crm/leads");
  const proposals = await import("../../../server/services/crm/proposals");
  const letters = await import("../../../server/services/crm/letters");
  const onboarding = await import("../../../server/services/crm/onboarding");
  const crossSell = await import("../../../server/services/crm/crosssell");
  const renewals = await import("../../../server/services/crm/renewals");
  const feedback = await import("../../../server/services/crm/feedback");
  const campaigns = await import("../../../server/services/crm/campaigns");
  const comms = await import("../../../server/services/crm/communications");
  type StaffActor = import("../../../server/permissions/actor").StaffActor;

  if ((await db().lead.count()) > 0) return; // demo already present
  await seedCrmReference(db());
  const today = todayIst();
  const users = new Map((await db().user.findMany({ where: { isSystem: false } })).map((u) => [u.username, u]));
  const A = (username: string): StaffActor => {
    const u = users.get(username)!;
    return { kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName };
  };
  const arvind = A("arvind.mehta");
  const kavita = A("kavita.rao");
  const managers = { rohan: A("rohan.iyer"), sneha: A("sneha.kulkarni"), imran: A("imran.shaikh") };
  const tpl = async (name: string) => (await db().serviceTemplate.findFirstOrThrow({ where: { name } })).id;
  const clientByName = async (name: string) => db().client.findFirst({ where: { name } });
  const PDF = Buffer.from("%PDF-1.4\n% demo signed engagement letter\n");

  // ---- Leads (about 20 across stages) -----------------------------------------
  type L = { name: string; entityType: string; owner: keyof typeof managers | "arvind" | "kavita"; source: string; fee: number; services: string[]; pan?: string; email?: string; phone?: string; contact?: string; referrer?: string; dupOf?: string };
  const L_ROWS: L[] = [
    { name: "Mehta Organics Private Limited", entityType: "PRIVATE_COMPANY", owner: "rohan", source: "REFERRAL", referrer: "Sharma Textiles Private Limited", fee: 1_80_000, services: ["GST", "AUDIT"], pan: "QXCMO4521K", contact: "Nikhil Mehta", email: "nikhil@mehtaorganics.example.com", phone: "9821100101" },
    { name: "Rathore Marble Exports", entityType: "PARTNERSHIP", owner: "rohan", source: "EVENT", fee: 90_000, services: ["GST", "DIRECT_TAX"], pan: "QXFRM2210B", contact: "Vikram Rathore", phone: "9829000202" },
    { name: "Pink City Hospitality LLP", entityType: "LLP", owner: "imran", source: "WEBSITE", fee: 60_000, services: ["COMPANY_LAW", "DIRECT_TAX"], contact: "Ayesha Khan", email: "ayesha@pinkcityhosp.example.com" },
    { name: "Dr. Kavya Joshi", entityType: "INDIVIDUAL", owner: "sneha", source: "REFERRAL", referrer: "Dr. Anjali Deshpande", fee: 15_000, services: ["DIRECT_TAX"], pan: "QXPKJ7781D", phone: "9811300303" },
    { name: "Aravali Solar Private Limited", entityType: "PRIVATE_COMPANY", owner: "arvind", source: "EVENT", fee: 4_50_000, services: ["AUDIT", "COMPANY_LAW", "GST"], pan: "QXCAS1001F", contact: "Rahul Bansal", email: "rahul@aravalisolar.example.com", phone: "9887700404" },
    { name: "Jodhpur Spice Traders", entityType: "PROPRIETORSHIP", owner: "rohan", source: "WEBSITE", fee: 36_000, services: ["GST", "ACCOUNTING"], phone: "9414400505" },
    { name: "Shekhawati Textiles Private Limited", entityType: "PRIVATE_COMPANY", owner: "imran", source: "REFERRAL", referrer: "Kiran Shah", fee: 2_20_000, services: ["AUDIT", "COMPANY_LAW"], pan: "QXCST5566H", contact: "Pooja Shekhawat", email: "pooja@shekhawati.example.com" },
    { name: "Ajmer Dairy Cooperative", entityType: "SOCIETY", owner: "sneha", source: "OTHER", fee: 80_000, services: ["AUDIT"], contact: "Secretary" },
    { name: "Udaipur Lake Resorts Private Limited", entityType: "PRIVATE_COMPANY", owner: "kavita", source: "EVENT", fee: 3_00_000, services: ["AUDIT", "GST", "DIRECT_TAX"], pan: "QXCUL3300M", contact: "Arjun Singh", email: "arjun@lakeresorts.example.com" },
    { name: "Kota Coaching Academy LLP", entityType: "LLP", owner: "rohan", source: "WEBSITE", fee: 1_20_000, services: ["GST", "ACCOUNTING", "ACCOUNTING"], contact: "Manish Gupta", phone: "9928800707" },
    { name: "Bikaner Namkeen Works", entityType: "PROPRIETORSHIP", owner: "sneha", source: "REFERRAL", referrer: "Mumbai Spice Co.", fee: 40_000, services: ["GST", "DIRECT_TAX"], phone: "9829900808" },
    { name: "Thar Logistics Private Limited", entityType: "PRIVATE_COMPANY", owner: "imran", source: "OTHER", fee: 1_50_000, services: ["COMPANY_LAW", "ACCOUNTING"], pan: "QXCTL8080P", email: "accounts@tharlogistics.example.com" },
    { name: "Hawa Mahal Handlooms", entityType: "PARTNERSHIP", owner: "rohan", source: "EVENT", fee: 55_000, services: ["GST"], phone: "9414900909" },
    { name: "Sanganer Prints Private Limited", entityType: "PRIVATE_COMPANY", owner: "arvind", source: "WEBSITE", fee: 2_50_000, services: ["AUDIT", "GST"], pan: "QXCSP6060R", contact: "Deepa Agarwal", email: "deepa@sanganerprints.example.com" },
    { name: "Neeraj Saxena", entityType: "INDIVIDUAL", owner: "sneha", source: "WEBSITE", fee: 12_000, services: ["DIRECT_TAX"], email: "neeraj.saxena@example.com" },
    { name: "Mewar Agro Foods Private Limited", entityType: "PRIVATE_COMPANY", owner: "kavita", source: "REFERRAL", referrer: "Kulkarni Foods Private Limited", fee: 1_75_000, services: ["AUDIT", "DIRECT_TAX"], pan: "QXCMA9090S", contact: "Harsh Mewara" },
  ];
  // Duplicates of existing clients by PAN (show the warning on the lead).
  const dupClients = await db().client.findMany({ where: { pan: { not: null }, isFirm: false, name: { in: ["Sharma Textiles Private Limited", "Jaipur Handicrafts Exports", "Coastal Fisheries Private Limited"] } } });
  for (const c of dupClients) {
    L_ROWS.push({ name: `${c.name.split(" ").slice(0, 2).join(" ")} (new enquiry)`, entityType: c.constitution, owner: "rohan", source: "WEBSITE", fee: 50_000, services: ["ADVISORY"], pan: c.pan!, dupOf: c.name });
  }

  const created = new Map<string, string>();
  for (const r of L_ROWS) {
    const actor = r.owner === "arvind" ? arvind : r.owner === "kavita" ? kavita : managers[r.owner];
    const ref = r.referrer ? await clientByName(r.referrer) : null;
    const lead = await leads.createLead(actor, {
      name: r.name, entityType: r.entityType as never, contactName: r.contact ?? "", email: r.email ?? null, phone: r.phone ?? null, pan: r.pan ?? null,
      services: [...new Set(r.services)] as never, estFeePaise: r.fee * 100, source: r.source as never, referrerClientId: ref?.id ?? null, referrerName: ref ? "" : (r.referrer ?? ""),
      overrideReason: r.dupOf ? `Existing client ${r.dupOf} asking for a separate assignment — confirmed by phone` : undefined,
    });
    created.set(r.name, lead.id);
  }
  const id = (name: string) => created.get(name)!;

  // Activities and stages
  const act = async (who: StaffActor, name: string, kind: string, daysAgo: number, notes: string, next?: string) =>
    leads.addLeadActivity(who, id(name), { kind: kind as never, date: addDays(today, -daysAgo), notes, nextFollowUp: next ?? null });
  await act(managers.rohan, "Rathore Marble Exports", "CALL", 6, "Discussed GST and ITR needs; sending service note.", today);
  await act(managers.imran, "Pink City Hospitality LLP", "EMAIL", 4, "Shared our LLP compliance checklist.", addDays(today, 3));
  await act(managers.imran, "Pink City Hospitality LLP", "MEETING", 2, "Met the designated partners at their office.", addDays(today, 7));
  await act(managers.sneha, "Dr. Kavya Joshi", "WHATSAPP", 3, "Asked for last year's ITR and Form 16.", addDays(today, 2));
  await act(managers.rohan, "Jodhpur Spice Traders", "CALL", 10, "Owner wants monthly bookkeeping with GST.", addDays(today, 1));
  await act(managers.rohan, "Kota Coaching Academy LLP", "MEETING", 5, "Walkthrough of fee receipts and GST on coaching.", today);
  await act(managers.sneha, "Bikaner Namkeen Works", "CALL", 8, "Interested; comparing with current CA.");
  await act(managers.imran, "Thar Logistics Private Limited", "MEETING", 12, "Board wants ROC and bookkeeping together.");
  await act(managers.rohan, "Hawa Mahal Handlooms", "CALL", 20, "Quoted GST retainer verbally.");
  await act(managers.sneha, "Ajmer Dairy Cooperative", "MEETING", 9, "Audit of the society; needs approval from committee.");
  await leads.updateLead(managers.sneha, id("Bikaner Namkeen Works"), { nextFollowUp: addDays(today, -2) }); // overdue follow-up
  await leads.setLeadStage(managers.rohan, id("Hawa Mahal Handlooms"), { stage: "LOST", lostReason: "Chose a local accountant at a lower fee" });
  await leads.setLeadStage(managers.sneha, id("Neeraj Saxena"), { stage: "LOST", lostReason: "Not reachable after three attempts" });
  await leads.setLeadStage(managers.sneha, id("Ajmer Dairy Cooperative"), { stage: "ON_HOLD" });
  await leads.setLeadStage(managers.imran, id("Pink City Hospitality LLP"), { stage: "MEETING" });

  // Business-development time linked to leads
  const bd = await db().internalCategory.findFirst({ where: { code: "BUSINESS_DEVELOPMENT" } });
  if (bd) {
    const rows: [string, string, number, number][] = [
      ["rohan.iyer", "Mehta Organics Private Limited", 3, 120], ["rohan.iyer", "Kota Coaching Academy LLP", 5, 90], ["arvind.mehta", "Aravali Solar Private Limited", 7, 180],
      ["imran.shaikh", "Shekhawati Textiles Private Limited", 4, 150], ["kavita.rao", "Udaipur Lake Resorts Private Limited", 6, 120], ["priya.nair", "Mehta Organics Private Limited", 2, 60],
    ];
    for (const [u, lead, ago, minutes] of rows) {
      await db().workEntry.create({ data: { userId: users.get(u)!.id, date: addDays(today, -ago), internalCategoryId: bd.id, leadId: id(lead), minutes, description: "Proposal preparation and client discussion", createdById: users.get(u)!.id } });
    }
  }

  // ---- Proposals --------------------------------------------------------------
  const mk = (who: StaffActor, lead: string, template: string) => tpl(template).then((t) => proposals.createProposal(who, { leadId: id(lead), serviceTemplateId: t }));
  // 1. Draft awaiting Partner approval
  await mk(managers.imran, "Shekhawati Textiles Private Limited", "Statutory audit");
  // 2. Approved, not yet sent
  const p2 = await mk(managers.rohan, "Kota Coaching Academy LLP", "Bookkeeping (monthly)");
  await proposals.approveProposal(arvind, p2.id);
  // 3. Sent, with a revised second version
  const p3 = await mk(managers.rohan, "Rathore Marble Exports", "GST returns (monthly / QRMP)");
  await proposals.approveProposal(arvind, p3.id);
  const p3v2 = await proposals.updateProposal(managers.rohan, p3.id, { feePaise: 27_000_00 });
  await proposals.approveProposal(kavita, p3v2.id);
  await proposals.markProposalSent(managers.rohan, p3v2.id);
  // 4. Accepted → letter → signed copy uploaded → client + engagement
  const p4 = await mk(arvind, "Aravali Solar Private Limited", "Statutory audit");
  await proposals.updateProposal(arvind, p4.id, { feePaise: 2_75_000_00 });
  await proposals.approveProposal(arvind, p4.id);
  await proposals.markProposalSent(arvind, p4.id);
  await proposals.decideProposal(arvind, p4.id, { decision: "ACCEPTED", note: "Accepted in meeting with the MD" });
  const l4 = await letters.generateLetter(arvind, p4.id);
  await letters.markLetterIssued(arvind, l4.letter.id);
  const team = ["vikram.singh", "aditya.kumar"].map((u) => users.get(u)?.id).filter((x): x is string => !!x);
  const accepted = await letters.acceptLetterWithSignedCopy(arvind, l4.letter.id, { name: "Aravali Solar - signed engagement letter.pdf", data: PDF }, { memberUserIds: team });
  // 5. Accepted, letter issued and awaiting signature
  const p5 = await mk(kavita, "Udaipur Lake Resorts Private Limited", "Tax audit");
  await proposals.approveProposal(kavita, p5.id);
  await proposals.markProposalSent(kavita, p5.id);
  await proposals.decideProposal(kavita, p5.id, { decision: "ACCEPTED" });
  const l5 = await letters.generateLetter(kavita, p5.id);
  await letters.markLetterIssued(kavita, l5.letter.id);
  // 6. Rejected
  const p6 = await mk(managers.sneha, "Bikaner Namkeen Works", "GST returns (monthly / QRMP)");
  await proposals.approveProposal(arvind, p6.id);
  await proposals.markProposalSent(managers.sneha, p6.id);
  await proposals.decideProposal(managers.sneha, p6.id, { decision: "REJECTED", note: "Fee higher than current CA" });

  // ---- Onboarding of the new client ----------------------------------------------
  const ob = await onboarding.getOnboarding(arvind, accepted.clientId);
  for (const code of ["KYC_PAN", "KYC_ADDRESS"]) {
    const item = ob.items.find((i) => i.code === code);
    if (item) await onboarding.setOnboardingItem(arvind, item.id, { done: true, note: "Copy received on email, verified with original" });
  }
  if (ob.checks[0]) await onboarding.decideConflict(arvind, ob.checks[0].id, { decision: "CLEARED", notes: "" });
  await onboarding.runLeadConflictCheck(managers.imran, id("Shekhawati Textiles Private Limited"));

  // ---- Cross-sell, renewals, feedback ----------------------------------------------
  await crossSell.runCrossSell();
  const recurring = await db().engagement.findMany({ where: { recurrence: "RECURRING", status: "ACTIVE", feePaise: { gt: 0 }, client: { isFirm: false, status: "ACTIVE" }, NOT: { name: { endsWith: "(recurring)" } } }, orderBy: { code: "asc" }, take: 60 });
  const picked = recurring.filter((_, i) => i % 12 === 0).slice(0, 5);
  for (const [i, e] of picked.entries()) {
    const r = await renewals.startRenewal(arvind, e.id);
    if (i === 0) await renewals.approveRenewal(arvind, r.id);
    if (i === 1) await renewals.proposeRenewalFee(managers.rohan.userId === e.managerId ? managers.rohan : arvind, r.id, { feePaise: r.suggestedFeePaise || e.feePaise });
  }
  const advisory = await db().engagement.findMany({ where: { engagementType: "OTHER", recurrence: "ONE_TIME", status: "ACTIVE", client: { isFirm: false } }, orderBy: { code: "asc" }, take: 3 });
  for (const [i, e] of advisory.entries()) {
    await db().engagement.update({ where: { id: e.id }, data: { status: "COMPLETED", closedAt: new Date(`${addDays(today, -(i + 2))}T17:00:00+05:30`), endDate: addDays(today, -(i + 2)) } });
  }
  await feedback.runFeedbackRequests(today);
  const asked = await db().feedback.findMany({ orderBy: { createdAt: "asc" } });
  if (asked[0]) await feedback.recordFeedback(arvind, asked[0].id, { rating: 5, comment: "Very thorough report, delivered on time." });
  if (asked[1]) await feedback.recordFeedback(arvind, asked[1].id, { rating: 2, comment: "Took too long to get replies on queries." });

  // ---- Contacts, communication log, key dates, campaign -------------------------------
  const someClients = await db().client.findMany({ where: { isFirm: false, status: "ACTIVE" }, orderBy: { code: "asc" }, take: 12, include: { contacts: { orderBy: { isPrimary: "desc" } } } });
  for (const [i, c] of someClients.entries()) {
    await comms.setClientCategoryTags(arvind, c.id, { category: i < 4 ? "A" : i < 8 ? "B" : "C", tags: i % 3 === 0 ? "family group" : "" });
    if (i < 3 && c.contacts[0]) await db().contact.update({ where: { id: c.contacts[0].id }, data: { birthday: `19${70 + i * 5}-${addDays(today, 4 + i * 9).slice(5)}` } });
    if (i === 5 && c.contacts[0]) await comms.setContactOptOut(arvind, c.contacts[0].id, true);
    if (i < 4) await comms.logClientCommunication(arvind, c.id, { kind: (["CALL", "MEETING", "EMAIL", "WHATSAPP"] as const)[i]!, date: addDays(today, -i - 1), notes: ["Discussed advance tax estimate for Q3", "Quarterly review meeting with the promoters", "Sent the list of pending documents", "Reminded about GSTR-1 data"][i]! });
  }
  const camp = await campaigns.createCampaign(arvind, {
    name: "Diwali greetings 2026",
    messageText: "Dear {name},\n\nWarm wishes for a happy and prosperous Diwali to you and everyone at {client}.\n\nWith regards,\nQEPEX India",
    segment: { categories: ["A", "B"], primaryOnly: true, channel: "PREFERRED" },
  });
  await campaigns.buildRecipients(arvind, camp.id);
  const first = await db().campaignRecipient.findFirst({ where: { campaignId: camp.id } });
  if (first) await campaigns.markRecipientsSent(arvind, camp.id, first.id);
}
