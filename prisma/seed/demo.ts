/**
 * Demo firm (brief §12). Deterministic: the same data every time. All identifiers (PAN, GSTIN,
 * DIN, Aadhaar, bank accounts) are FAKE but correctly formatted. Phase 1 loads people, clients and
 * engagements; later phases extend this file with tasks, entries, invoices, payroll, portal users…
 */
import type { PrismaClient } from "../../generated/prisma/client";
import bcrypt from "bcryptjs";
import { encrypt } from "../../server/lib/crypto";
import { gstinCheckChar } from "../../server/domain/gstin";

export const DEMO_PASSWORD = "Qepex@2026";
/** Shared authenticator secret for demo Partners/Managers/Admins (2FA is mandatory for them). */
export const DEMO_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261006);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join("");
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(rand() * 26))).join("");

/** PAN: AAA + entity-type letter + first letter of name + 4 digits + letter. */
function fakePan(entity: string, name: string) {
  const first = (name.replace(/[^A-Za-z]/g, "")[0] ?? "X").toUpperCase();
  return `${letters(3)}${entity}${first}${digits(4)}${letters(1)}`;
}
const PAN_ENTITY: Record<string, string> = {
  INDIVIDUAL: "P", HUF: "H", PROPRIETORSHIP: "P", PARTNERSHIP: "F", LLP: "F", PRIVATE_COMPANY: "C", PUBLIC_COMPANY: "C", TRUST: "T", SOCIETY: "A", OTHER: "A",
};
function fakeGstin(stateGst: string, pan: string, entityNo: number) {
  const base = `${stateGst}${pan}${entityNo}Z`;
  return base + gstinCheckChar(base);
}

// ---------------------------------------------------------------------------
// People (2 Partners, 3 Managers, 8 Staff, 6 Articles, 1 Practice Admin, 1 HR Admin)
// ---------------------------------------------------------------------------
type P = { username: string; name: string; role: string; senior?: boolean; designation: string; manager?: string; team?: string };
const PEOPLE: P[] = [
  { username: "arvind.mehta", name: "Arvind Mehta", role: "PARTNER", designation: "Partner" },
  { username: "kavita.rao", name: "Kavita Rao", role: "PARTNER", designation: "Partner" },
  { username: "rohan.iyer", name: "Rohan Iyer", role: "MANAGER", designation: "Senior Manager", manager: "arvind.mehta" },
  { username: "sneha.kulkarni", name: "Sneha Kulkarni", role: "MANAGER", designation: "Manager", manager: "kavita.rao" },
  { username: "imran.shaikh", name: "Imran Shaikh", role: "MANAGER", designation: "Manager", manager: "arvind.mehta" },
  { username: "priya.nair", name: "Priya Nair", role: "STAFF", senior: true, designation: "Senior Associate", manager: "rohan.iyer", team: "GST & Audit" },
  { username: "neha.gupta", name: "Neha Gupta", role: "STAFF", designation: "Associate", manager: "rohan.iyer", team: "GST & Audit" },
  { username: "karthik.reddy", name: "Karthik Reddy", role: "STAFF", designation: "Associate", manager: "rohan.iyer", team: "GST & Audit" },
  { username: "vikram.singh", name: "Vikram Singh", role: "STAFF", senior: true, designation: "Senior Associate", manager: "sneha.kulkarni", team: "Direct Tax" },
  { username: "pooja.joshi", name: "Pooja Joshi", role: "STAFF", designation: "Associate", manager: "sneha.kulkarni", team: "Direct Tax" },
  { username: "ananya.das", name: "Ananya Das", role: "STAFF", senior: true, designation: "Senior Associate", manager: "imran.shaikh", team: "Company Law" },
  { username: "rahul.verma", name: "Rahul Verma", role: "STAFF", senior: true, designation: "Senior Associate", manager: "imran.shaikh", team: "Company Law" },
  { username: "siddharth.menon", name: "Siddharth Menon", role: "STAFF", designation: "Associate", manager: "sneha.kulkarni", team: "Direct Tax" },
  { username: "aditya.kumar", name: "Aditya Kumar", role: "ARTICLE", designation: "Article Assistant", manager: "rohan.iyer", team: "GST & Audit" },
  { username: "meera.pillai", name: "Meera Pillai", role: "ARTICLE", designation: "Article Assistant", manager: "rohan.iyer", team: "GST & Audit" },
  { username: "harsh.patel", name: "Harsh Patel", role: "ARTICLE", designation: "Article Assistant", manager: "sneha.kulkarni", team: "Direct Tax" },
  { username: "divya.krishnan", name: "Divya Krishnan", role: "ARTICLE", designation: "Article Assistant", manager: "sneha.kulkarni", team: "Direct Tax" },
  { username: "faizan.ali", name: "Faizan Ali", role: "ARTICLE", designation: "Article Assistant", manager: "imran.shaikh", team: "Company Law" },
  { username: "ishita.banerjee", name: "Ishita Banerjee", role: "ARTICLE", designation: "Article Assistant", manager: "imran.shaikh", team: "Company Law" },
  { username: "suresh.pillai", name: "Suresh Pillai", role: "PRACTICE_ADMIN", designation: "Practice Administrator", manager: "arvind.mehta" },
  { username: "lakshmi.narayanan", name: "Lakshmi Narayanan", role: "HR_ADMIN", designation: "HR Executive", manager: "kavita.rao" },
];
const TEAMS: Record<string, string> = { "GST & Audit": "rohan.iyer", "Direct Tax": "sneha.kulkarni", "Company Law": "imran.shaikh" };
const MANDATORY_2FA = ["PARTNER", "MANAGER", "PRACTICE_ADMIN", "HR_ADMIN"];

// ---------------------------------------------------------------------------
// Clients: [name, constitution, state, group, features]
// features: M=GST monthly, Q=GST QRMP (I = IFF), C=composition, 2=second GSTIN, 9=GSTR-9, 9C, T=TDS (s=salary n=non-salary r=non-resident),
// X=TCS, A=tax audit, P=transfer pricing, V=advance tax, F=PF, E=ESI, K=PT, S=MSME, B=books by firm, N=notice, Y=advisory, U=no AGM yet
// ---------------------------------------------------------------------------
type C = [string, string, string, string | null, string];
const CLIENTS: C[] = [
  ["Rajesh Kumar Sharma", "INDIVIDUAL", "MH", "Sharma Family", "V"],
  ["Sunita Sharma", "INDIVIDUAL", "MH", "Sharma Family", ""],
  ["Rajesh Kumar Sharma (HUF)", "HUF", "MH", "Sharma Family", "V"],
  ["Sharma Textiles Private Limited", "PRIVATE_COMPANY", "MH", "Sharma Family", "M 2 9 9C T s n A V F E K S B"],
  ["Dr. Anjali Deshpande", "INDIVIDUAL", "MH", null, "V N"],
  ["Venkatesh Iyer", "INDIVIDUAL", "TN", null, ""],
  ["Fatima Begum", "INDIVIDUAL", "TS", null, "Y"],
  ["Gurpreet Singh Bhatia", "INDIVIDUAL", "DL", null, "V"],
  ["Agarwal Steel Traders", "PROPRIETORSHIP", "WB", "Agarwal Group", "M 9 T n A V K"],
  ["Agarwal Industries Limited", "PUBLIC_COMPANY", "WB", "Agarwal Group", "M 2 9 9C T s n r X A P V F E K S"],
  ["Agarwal Logistics LLP", "LLP", "WB", "Agarwal Group", "Q I T n A"],
  ["Ramesh Agarwal (HUF)", "HUF", "WB", "Agarwal Group", "V"],
  ["Reddy Constructions Private Limited", "PRIVATE_COMPANY", "TS", "Reddy Promoters", "M 9 9C T s n A V F E K S N"],
  ["Reddy Infra Projects LLP", "LLP", "AP", "Reddy Promoters", "M T n A"],
  ["Srinivas Reddy", "INDIVIDUAL", "TS", "Reddy Promoters", "V"],
  ["Kulkarni & Associates", "PARTNERSHIP", "KA", "Kulkarni Family", "Q T n A K B"],
  ["Kulkarni Foods Private Limited", "PRIVATE_COMPANY", "KA", "Kulkarni Family", "M 9 T s n A F E K U"],
  ["Mahesh Kulkarni", "INDIVIDUAL", "KA", "Kulkarni Family", ""],
  ["Shah Polymers Private Limited", "PRIVATE_COMPANY", "GJ", "Shah Industries", "M 2 9 9C T s n X A P V F E K S"],
  ["Shah Exports", "PARTNERSHIP", "GJ", "Shah Industries", "M 9 T n A"],
  ["Kiran Shah", "INDIVIDUAL", "GJ", "Shah Industries", "V"],
  ["Nair Holdings Private Limited", "PRIVATE_COMPANY", "KL", "Nair Holdings", "T n A V U"],
  ["Nair Ayurveda Clinic", "PROPRIETORSHIP", "KL", "Nair Holdings", "C B"],
  ["Bose Electricals", "PROPRIETORSHIP", "WB", "Bose Family", "Q T n K B"],
  ["Subhash Chandra Bose (HUF)", "HUF", "WB", "Bose Family", ""],
  ["Sinha Tech Solutions Private Limited", "PRIVATE_COMPANY", "JH", "Sinha Group", "M 9 T s n r A P V F E K"],
  ["Sinha Consultants LLP", "LLP", "BR", "Sinha Group", "Q I T n"],
  ["Pune Auto Components Limited", "PUBLIC_COMPANY", "MH", null, "M 2 9 9C T s n X A V F E K S N"],
  ["Mumbai Spice Co.", "PROPRIETORSHIP", "MH", null, "C"],
  ["Chennai Software Services Private Limited", "PRIVATE_COMPANY", "TN", null, "M 9 T s n r A P V F E K S"],
  ["Bengaluru Design Studio LLP", "LLP", "KA", null, "Q T n K"],
  ["Hyderabad Pharma Distributors", "PARTNERSHIP", "TS", null, "M 9 T n A K"],
  ["Jaipur Handicrafts Exports", "PARTNERSHIP", "RJ", null, "M 9 T n A"],
  ["Lucknow Sweets Private Limited", "PRIVATE_COMPANY", "UP", null, "M T s n A F E U"],
  ["Indore Agro Traders", "PROPRIETORSHIP", "MP", null, "Q T n K B"],
  ["Shri Ram Charitable Trust", "TRUST", "MH", null, "T n A"],
  ["Vidya Vikas Education Trust", "TRUST", "KA", null, "T s n A F K"],
  ["Green Valley Housing Society", "SOCIETY", "MH", null, "T n"],
  ["Coastal Fisheries Private Limited", "PRIVATE_COMPANY", "GA", null, "M 9 T s n A F E"],
  ["Northeast Tea Estates LLP", "LLP", "AS", null, "M T s n A F E K"],
];

// ---------------------------------------------------------------------------
export async function seedDemo(db: PrismaClient) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const designations = new Map((await db.designation.findMany()).map((d) => [d.name, d.id]));
  const states = new Map((await db.state.findMany()).map((s) => [s.code, s]));
  const users = new Map<string, { id: string; role: string }>();

  // People
  for (const p of PEOPLE) {
    const u = await db.user.create({
      data: {
        username: p.username,
        displayName: p.name,
        email: `${p.username}@qepex-demo.in`,
        mobile: `9${digits(9)}`,
        passwordHash,
        role: p.role,
        isSenior: p.senior ?? false,
        designationId: designations.get(p.designation) ?? null,
        defaultLocation: "OFFICE",
        totpEnabled: MANDATORY_2FA.includes(p.role),
        totpSecretEnc: MANDATORY_2FA.includes(p.role) ? encrypt(DEMO_TOTP_SECRET, "VAULT") : null,
        totpEnrolledAt: MANDATORY_2FA.includes(p.role) ? new Date("2026-04-01T04:30:00Z") : null,
        searchName: `${p.name} ${p.username}`.toLowerCase(),
        createdById: "system",
      },
    });
    users.set(p.username, { id: u.id, role: p.role });
  }
  for (const p of PEOPLE) {
    if (p.manager) await db.user.update({ where: { id: users.get(p.username)!.id }, data: { reportingManagerId: users.get(p.manager)!.id } });
  }

  // Employee profiles (PII encrypted with the PII key)
  let empNo = 1;
  for (const p of PEOPLE) {
    const pan = fakePan("P", p.name.split(" ").at(-1)!);
    const aadhaar = `${2 + Math.floor(rand() * 8)}${digits(11)}`;
    await db.employeeProfile.create({
      data: {
        userId: users.get(p.username)!.id,
        employeeCode: `EMP-${String(empNo++).padStart(4, "0")}`,
        employeeCategory: p.role === "PARTNER" ? "PARTNER" : p.role === "ARTICLE" ? "ARTICLE" : ["PRACTICE_ADMIN", "HR_ADMIN"].includes(p.role) ? "ADMIN" : "STAFF",
        dateOfBirth: `${1975 + Math.floor(rand() * 28)}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
        gender: pick(["F", "M"]),
        personalEmail: `${p.username}@example.com`,
        personalMobile: `9${digits(9)}`,
        address: "Andheri East, Mumbai 400069",
        emergencyName: "Family contact",
        emergencyPhone: `9${digits(9)}`,
        bankNameEnc: encrypt(pick(["HDFC Bank", "State Bank of India", "ICICI Bank", "Axis Bank"]), "PII"),
        bankAccountEnc: encrypt(digits(14), "PII"),
        bankIfscEnc: encrypt(`${pick(["HDFC", "SBIN", "ICIC", "UTIB"])}0${digits(6)}`, "PII"),
        panEnc: encrypt(pan, "PII"),
        aadhaarEnc: encrypt(aadhaar, "PII"),
        aadhaarLast4: aadhaar.slice(-4),
        uan: p.role === "PARTNER" ? null : `10${digits(10)}`,
        qualifications: p.role === "PARTNER" ? "FCA" : p.role === "MANAGER" ? "ACA" : p.role === "ARTICLE" ? "CA Intermediate" : "B.Com",
        membershipBody: ["PARTNER", "MANAGER"].includes(p.role) ? "ICAI" : null,
        membershipNo: ["PARTNER", "MANAGER"].includes(p.role) ? digits(6) : null,
        joiningDate: p.role === "PARTNER" ? "2012-04-01" : p.role === "ARTICLE" ? pick(["2024-07-01", "2025-01-15", "2025-08-01"]) : pick(["2019-06-10", "2021-08-02", "2023-04-03"]),
        workStateCode: "MH",
        createdById: "system",
      },
    });
  }

  // Client teams
  const teams = new Map<string, string>();
  for (const [name, lead] of Object.entries(TEAMS)) {
    const t = await db.clientTeam.create({ data: { name, leadManagerId: users.get(lead)!.id, createdById: "system" } });
    teams.set(name, t.id);
  }
  for (const p of PEOPLE) {
    if (p.team) await db.clientTeamMember.create({ data: { teamId: teams.get(p.team)!, userId: users.get(p.username)!.id, fromDate: "2026-04-01", createdById: "system" } });
  }
  const teamMembers = (team: string) => PEOPLE.filter((p) => p.team === team);

  // Firm profile + the firm as an internal client (spec 13.6)
  await db.firmProfile.create({
    data: {
      name: "QEPEX India (Demo)", address: "401, Business Square, Andheri East, Mumbai 400069", stateCode: "MH",
      gstin: fakeGstin("27", "AAFFQ1234K", 1), pan: "AAFFQ1234K", email: "accounts@qepex-demo.in", phone: "022 4000 0000",
      bankName: "HDFC Bank", bankAccount: "50200012345678", bankIfsc: "HDFC0000123", upiId: "qepex@hdfcbank", createdById: "system",
    },
  });
  await db.client.create({
    data: {
      code: "CL-0000", name: "QEPEX India (Firm)", searchName: "qepex india firm", constitution: "PARTNERSHIP", pan: "AAFFQ1234K",
      stateCode: "MH", isFirm: true, partnerId: users.get("arvind.mehta")!.id, managerId: users.get("rohan.iyer")!.id,
      tdsApplicable: true, tdsSalary: true, tdsNonSalary: true, pfApplicable: true, esiApplicable: true, advanceTaxApplicable: true,
      statusEffectiveFrom: "2012-04-01", createdById: "system",
      gstins: { create: { gstin: fakeGstin("27", "AAFFQ1234K", 1), stateCode: "MH", frequency: "MONTHLY", annualReturnApplicable: true, frequencyEffectiveFrom: "2017-07-01" } },
      ptRegistrations: { create: { stateCode: "MH", kind: "EMPLOYER", registrationNo: `27${digits(9)}P`, effectiveFrom: "2012-04-01" } },
    },
  });

  // Groups
  const groups = new Map<string, string>();
  let groupNo = 1;
  for (const g of [...new Set(CLIENTS.map((c) => c[3]).filter(Boolean))] as string[]) {
    const row = await db.clientGroup.create({ data: { code: `GR-${String(groupNo++).padStart(3, "0")}`, name: `${g} Group`.replace("Group Group", "Group"), searchName: g.toLowerCase(), createdById: "system" } });
    groups.set(g, row.id);
  }

  const teamFor = (f: string, constitution: string) =>
    ["PRIVATE_COMPANY", "PUBLIC_COMPANY", "LLP"].includes(constitution) && !f.includes("A ") ? "Company Law"
      : f.includes("M") || f.includes("Q") || f.includes("C") || f.includes("A") ? "GST & Audit"
        : "Direct Tax";
  const partners = ["arvind.mehta", "kavita.rao"];
  const directorPool: { id: string; din: string }[] = [];
  let engNo = 1;
  let clientNo = 1;
  const stageVersions = new Map(
    (await db.stageTemplate.findMany({ include: { versions: { where: { status: "ACTIVE" } } } })).map((t) => [t.code, t.versions[0]?.id ?? null]),
  );

  for (const [name, constitution, stateCode, group, features] of CLIENTS) {
    const f = ` ${features} `;
    const has = (code: string) => f.includes(` ${code} `);
    const pan = fakePan(PAN_ENTITY[constitution]!, name.replace(/^(Dr\.|Shri)\s+/, ""));
    const team = teamFor(f, constitution);
    const managerUsername = TEAMS[team]!;
    const isCo = constitution === "PRIVATE_COMPANY" || constitution === "PUBLIC_COMPANY";
    const tds = has("T");
    const client = await db.client.create({
      data: {
        code: `CL-${String(clientNo++).padStart(4, "0")}`,
        name, searchName: `${name} ${pan}`.toLowerCase(), constitution, pan, stateCode,
        tan: tds ? `${pan.slice(0, 4)}${digits(5)}${letters(1)}` : null,
        cinLlpin: isCo ? `U${digits(5)}${stateCode}${2000 + Math.floor(rand() * 24)}PTC${digits(6)}`.replace("PTC", constitution === "PUBLIC_COMPANY" ? "PLC" : "PTC") : constitution === "LLP" ? `${letters(3)}-${digits(4)}` : null,
        udyam: has("S") ? `UDYAM-${stateCode}-${digits(2)}-${digits(7)}` : null,
        incorporationDate: isCo || constitution === "LLP" ? `${2005 + Math.floor(rand() * 18)}-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}` : null,
        groupId: group ? groups.get(group)! : null,
        booksBy: has("B") ? "FIRM" : "CLIENT",
        partnerId: users.get(pick(partners))!.id,
        managerId: users.get(managerUsername)!.id,
        teamId: teams.get(team)!,
        category: pick(["A", "B", "B", "C"]),
        publicInterest: constitution === "PUBLIC_COMPANY",
        leadSource: pick(["REFERRAL", "EXISTING_CLIENT", "WEBSITE", "EVENT"]),
        onboardingDate: `20${pick(["18", "19", "20", "21", "22", "23", "24"])}-04-01`,
        kycStatus: pick(["COMPLETE", "COMPLETE", "COMPLETE", "PARTIAL"]),
        preferredChannel: pick(["EMAIL", "WHATSAPP", "WHATSAPP"]),
        tdsApplicable: tds, tdsSalary: has("s"), tdsNonSalary: has("n"), tdsNonResident: has("r"), tcsApplicable: has("X"),
        taxAuditApplicable: has("A"), transferPricingApplicable: has("P"),
        statutoryAuditApplicable: isCo || (has("A") && (constitution === "TRUST" || constitution === "LLP")),
        advanceTaxApplicable: has("V") || isCo, pfApplicable: has("F"), esiApplicable: has("E"), msmeApplicable: has("S"),
        dpt3Applicable: isCo,
        statusEffectiveFrom: "2026-04-01",
        createdById: "system",
      },
    });

    // GSTINs
    const gstRegistered = has("M") || has("Q") || has("C");
    const gstStates = has("2") ? [stateCode, stateCode === "MH" ? "KA" : stateCode === "GJ" ? "MH" : stateCode === "WB" ? "JH" : "MH"] : [stateCode];
    if (gstRegistered) {
      let n = 1;
      for (const sc of gstStates) {
        await db.gSTIN.create({
          data: {
            clientId: client.id, gstin: fakeGstin(states.get(sc)!.gstCode, pan, n++), stateCode: sc, tradeName: name.replace(/ Private Limited| Limited| LLP/, ""),
            frequency: has("C") ? "COMPOSITION" : has("Q") ? "QRMP" : "MONTHLY", iffOpted: has("I"), annualReturnApplicable: has("9") || has("C"),
            gstr9cApplicable: has("9C"), frequencyEffectiveFrom: "2025-04-01", registrationDate: "2017-07-01", createdById: "system",
          },
        });
      }
    }

    // Directors / designated partners (some shared across group companies)
    if (isCo || constitution === "LLP") {
      const count = isCo ? 2 + Math.floor(rand() * 2) : 2;
      for (let i = 0; i < count; i++) {
        const reuse = group && directorPool.length > 0 && i === 0 && rand() < 0.5;
        let director = reuse ? directorPool[directorPool.length - 1]! : null;
        if (!director) {
          const dName = `${pick(["Ramesh", "Suresh", "Anita", "Deepak", "Kavya", "Manoj", "Rekha", "Sanjay", "Lata", "Vivek"])} ${name.split(" ")[0]}`;
          const din = `0${digits(7)}`;
          const created = await db.director.create({
            data: { din, name: dName, searchName: `${dName} ${din}`.toLowerCase(), panEnc: encrypt(fakePan("P", dName.split(" ")[1]!), "PII"), primaryClientId: client.id, createdById: "system" },
          });
          director = { id: created.id, din };
          directorPool.push(director);
        }
        await db.clientDirector.upsert({
          where: { clientId_directorId: { clientId: client.id, directorId: director.id } },
          create: { clientId: client.id, directorId: director.id, designation: constitution === "LLP" ? "DESIGNATED_PARTNER" : i === 0 ? "MANAGING_DIRECTOR" : "DIRECTOR", appointedOn: "2018-04-01", createdById: "system" },
          update: {},
        });
      }
      // AGM for FY 2025-26 (some unknown yet → provisional dates in Phase 2)
      if (isCo && !has("U")) {
        await db.eventDate.create({ data: { clientId: client.id, eventTypeCode: "AGM", periodKey: "FY2025-26", dateValue: `2026-09-${String(15 + Math.floor(rand() * 15)).padStart(2, "0")}`, createdById: "system" } });
      }
    }

    // PT registration only where PT is levied (Q-02)
    if (has("K") && states.get(stateCode)?.ptLevied) {
      await db.clientPtRegistration.create({ data: { clientId: client.id, stateCode, kind: "EMPLOYER", registrationNo: `${states.get(stateCode)!.gstCode}${digits(9)}`, effectiveFrom: "2020-04-01", createdById: "system" } });
    }

    // Contacts
    const first = name.split(" ")[0]!;
    await db.contact.create({
      data: {
        clientId: client.id, name: constitution === "INDIVIDUAL" || constitution === "HUF" ? name.replace(" (HUF)", "") : `${pick(["Amit", "Nisha", "Rakesh", "Swati"])} ${first}`,
        role: constitution === "INDIVIDUAL" ? "Self" : "Promoter", email: `${first.toLowerCase()}.${digits(3)}@example.com`, phone: `9${digits(9)}`,
        whatsapp: `9${digits(9)}`, preferredChannel: client.preferredChannel, isPrimary: true, isBilling: true, createdById: "system",
      },
    });
    if (!["INDIVIDUAL", "HUF"].includes(constitution)) {
      await db.contact.create({
        data: { clientId: client.id, name: `${pick(["Mohan", "Geeta", "Farhan", "Shalini"])} (Accounts)`, role: "Accountant", email: `accounts.${digits(3)}@example.com`, phone: `9${digits(9)}`, createdById: "system" },
      });
    }

    // Flag history for the flags that are on (so "when did this apply" is answerable)
    for (const flag of ["tdsApplicable", "tcsApplicable", "taxAuditApplicable", "transferPricingApplicable", "statutoryAuditApplicable", "advanceTaxApplicable", "pfApplicable", "esiApplicable", "msmeApplicable", "dpt3Applicable"] as const) {
      if (client[flag]) {
        await db.clientFlagHistory.create({ data: { clientId: client.id, flag, newValue: "true", effectiveDate: "2026-04-01", reason: "Opening balance (demo)", createdById: "system" } });
      }
    }

    // Engagements (~150 in total)
    const members = teamMembers(team);
    const makers = members.filter((m) => !m.senior);
    const seniors = members.filter((m) => m.senior);
    const mk = async (e: { name: string; serviceLine: string; type: string; recurrence: "RECURRING" | "ONE_TIME"; feeBasis?: string; fee: number; budgetHours: number; checkerRole?: "SENIOR" | "MANAGER" | "PARTNER"; status?: string }) => {
      const eng = await db.engagement.create({
        data: {
          code: `EN-${String(engNo++).padStart(5, "0")}`, clientId: client.id, name: e.name, serviceLine: e.serviceLine, engagementType: e.type,
          recurrence: e.recurrence, stageTemplateVersionId: stageVersions.get(e.type) ?? null, feeBasis: e.feeBasis ?? "FIXED",
          feePaise: e.fee * 100, ratePaisePerHour: e.feeBasis === "TIME" ? 2500_00 : 0, budgetMinutes: e.budgetHours * 60,
          chargeable: true, status: e.status ?? "ACTIVE", startDate: "2026-04-01", partnerId: client.partnerId, managerId: client.managerId,
          eqrRequired: constitution === "PUBLIC_COMPANY" && e.type === "AUDIT", createdById: "system",
        },
      });
      const maker = pick(makers.length ? makers : members);
      await db.engagementAssignment.create({ data: { engagementId: eng.id, userId: users.get(maker.username)!.id, role: "MAKER", fromDate: "2026-04-01", createdById: "system" } });
      const checkerUser =
        e.checkerRole === "PARTNER" ? client.partnerId! : e.checkerRole === "MANAGER" || seniors.length === 0 ? client.managerId! : users.get(pick(seniors).username)!.id;
      await db.engagementAssignment.create({ data: { engagementId: eng.id, userId: checkerUser, role: "CHECKER", fromDate: "2026-04-01", createdById: "system" } });
      if (eng.eqrRequired) {
        const eqr = partners.map((u) => users.get(u)!.id).find((id) => id !== client.partnerId)!;
        await db.engagementAssignment.create({ data: { engagementId: eng.id, userId: eqr, role: "EQR", fromDate: "2026-04-01", createdById: "system" } });
      }
    };

    if (gstRegistered) await mk({ name: "GST returns FY 2026-27", serviceLine: "GST", type: "GST_RETURN", recurrence: "RECURRING", feeBasis: "RETAINER", fee: has("2") ? 60000 : 30000, budgetHours: has("2") ? 120 : 60, checkerRole: "SENIOR" });
    await mk({ name: "Income tax return AY 2026-27", serviceLine: "DIRECT_TAX", type: "INCOME_TAX_RETURN", recurrence: "RECURRING", fee: isCo ? 40000 : constitution === "INDIVIDUAL" ? 7500 : 20000, budgetHours: isCo ? 30 : 8, checkerRole: has("A") || isCo ? "PARTNER" : "MANAGER" });
    if (tds) await mk({ name: "TDS returns FY 2026-27", serviceLine: "DIRECT_TAX", type: "TDS_RETURN", recurrence: "RECURRING", feeBasis: "RETAINER", fee: 24000, budgetHours: 32, checkerRole: "SENIOR" });
    if (isCo || (has("A") && (constitution === "TRUST" || constitution === "LLP"))) await mk({ name: "Statutory audit FY 2025-26", serviceLine: "AUDIT", type: "AUDIT", recurrence: "RECURRING", fee: constitution === "PUBLIC_COMPANY" ? 450000 : 150000, budgetHours: constitution === "PUBLIC_COMPANY" ? 400 : 150, checkerRole: "PARTNER" });
    if (has("A") && !isCo) await mk({ name: "Tax audit AY 2026-27", serviceLine: "AUDIT", type: "AUDIT", recurrence: "RECURRING", fee: 50000, budgetHours: 45, checkerRole: "PARTNER" });
    if (has("P")) await mk({ name: "Transfer pricing report (3CEB) AY 2026-27", serviceLine: "DIRECT_TAX", type: "AUDIT", recurrence: "RECURRING", fee: 120000, budgetHours: 80, checkerRole: "PARTNER" });
    if (isCo || constitution === "LLP") await mk({ name: "ROC annual filing FY 2025-26", serviceLine: "COMPANY_LAW", type: "ROC_ANNUAL", recurrence: "RECURRING", fee: isCo ? 35000 : 15000, budgetHours: 20, checkerRole: "MANAGER" });
    if (has("B")) await mk({ name: "Bookkeeping FY 2026-27", serviceLine: "ACCOUNTING", type: "BOOKKEEPING", recurrence: "RECURRING", feeBasis: "RETAINER", fee: 96000, budgetHours: 200, checkerRole: "SENIOR" });
    if (has("F") || has("E")) await mk({ name: "PF / ESI returns FY 2026-27", serviceLine: "ACCOUNTING", type: "PAYROLL_STATUTORY", recurrence: "RECURRING", feeBasis: "RETAINER", fee: 36000, budgetHours: 36, checkerRole: "SENIOR" });
    if (has("N")) await mk({ name: pick(["Notice u/s 143(2) AY 2024-25", "GST notice ASMT-10 FY 2023-24", "Notice u/s 148 AY 2022-23"]), serviceLine: "DIRECT_TAX", type: "NOTICE", recurrence: "ONE_TIME", feeBasis: "TIME", fee: 0, budgetHours: 25, checkerRole: "MANAGER" });
    if (has("Y") || (isCo && rand() < 0.35)) await mk({ name: pick(["Project report for bank loan", "Business valuation", "FEMA compliance review", "Startup India registration"]), serviceLine: "ADVISORY", type: "OTHER", recurrence: "ONE_TIME", fee: 75000, budgetHours: 40, checkerRole: "MANAGER" });
  }
}
