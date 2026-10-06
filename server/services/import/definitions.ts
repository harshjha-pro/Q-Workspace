import type { Column, ParsedRow, SheetSpec } from "../../excel/workbook";
import { db } from "../../lib/db";
import {
  CONSTITUTIONS, CLIENT_FLAGS, DIN_RE, GST_FREQUENCIES, PAN_RE, TAN_RE, isCompany, ROLES, LOCATIONS, type ClientFlag,
} from "../../domain/enums";
import { isValidGstin } from "../../domain/gstin";
import { isIsoDate } from "../../lib/dates";
import { parseInrToPaise } from "../../lib/money";
import type { Actor } from "../../permissions/actor";
import { createClient, addGstin, addDirector, addPtRegistration, saveContact, createGroup } from "../clients/service";
import { createUser } from "../users/service";
import { createTeam, addTeamMember } from "../teams/service";
import { upsertEmployeeProfile } from "../employees/service";
import { encryptJson, encrypt } from "../../lib/crypto";
import { transaction } from "../../lib/db";
import { writeAudit } from "../../audit";
import { toSearch } from "../../lib/codes";

export type ImportKind = "CLIENTS" | "USERS" | "CLIENT_TEAMS" | "EMPLOYEES" | "SALARY_STRUCTURES" | "LEAVE_BALANCES" | "RECEIVABLES" | "LEADS";
export type CheckedRow = { sheet: string; rowNumber: number; data: Record<string, string>; errors: string[] };
export type ApplyResult = { created: number; notes: string[]; tempPasswords?: { username: string; tempPassword: string }[] };

export type ImportDef = {
  kind: ImportKind;
  title: string;
  /** Roles allowed to run this import (in addition to the import.run capability). */
  roles: string[];
  sheets: SheetSpec[];
  instructions: string[];
  validate: (sheets: Record<string, ParsedRow[]>) => Promise<CheckedRow[]>;
  apply: (actor: Actor, rows: CheckedRow[]) => Promise<ApplyResult>;
  preview?: (rows: CheckedRow[]) => string[];
};

const YES = new Set(["y", "yes", "true", "1"]);
const NO = new Set(["", "n", "no", "false", "0"]);
const yn = (v: string, errors: string[], label: string) => {
  const s = v.trim().toLowerCase();
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  errors.push(`${label}: use Y or N`);
  return false;
};
const upper = (s: string) => s.trim().toUpperCase();
const req = (d: Record<string, string>, key: string, label: string, errors: string[]) => {
  if (!d[key]?.trim()) errors.push(`${label} is required`);
  return d[key]?.trim() ?? "";
};
const dateOpt = (v: string, label: string, errors: string[]) => {
  if (!v) return null;
  if (!isIsoDate(v)) errors.push(`${label}: use a date (YYYY-MM-DD or an Excel date)`);
  return v;
};
const col = (key: string, header: string, extra: Partial<Column> = {}): Column => ({ key, header, ...extra });

async function userMap() {
  return new Map((await db().user.findMany({ where: { isSystem: false } })).map((u) => [u.username, u]));
}

// ---------------------------------------------------------------------------
// CLIENTS (with flags, GSTINs, directors, PT) — P1-16
// ---------------------------------------------------------------------------
const FLAG_COLUMNS: [ClientFlag, string][] = [
  ["tdsApplicable", "TDS"], ["tdsSalary", "TDS salary (24Q)"], ["tdsNonSalary", "TDS non-salary (26Q)"], ["tdsNonResident", "TDS non-resident (27Q)"],
  ["tcsApplicable", "TCS (27EQ)"], ["taxAuditApplicable", "Tax audit"], ["transferPricingApplicable", "Transfer pricing (3CEB)"],
  ["statutoryAuditApplicable", "Statutory audit"], ["advanceTaxApplicable", "Advance tax"], ["pfApplicable", "PF"], ["esiApplicable", "ESI"],
  ["msmeApplicable", "MSME Form 1"], ["dpt3Applicable", "DPT-3"],
];

const clientsDef: ImportDef = {
  kind: "CLIENTS",
  title: "Clients (with flags, GSTINs, directors, PT)",
  roles: ["PARTNER", "PRACTICE_ADMIN"],
  sheets: [
    {
      name: "Clients",
      columns: [
        col("ref", "Client ref", { required: true, example: "C1", note: "Any unique short text; used to link GSTINs, directors and PT rows below" }),
        col("name", "Name", { required: true, example: "Shree Ganesh Traders Private Limited", width: 36 }),
        col("constitution", "Constitution", { required: true, example: "PRIVATE_COMPANY", note: CONSTITUTIONS.join(", ") }),
        col("pan", "PAN", { example: "AABCS1234K" }),
        col("tan", "TAN", { example: "MUMS12345A" }),
        col("cinLlpin", "CIN / LLPIN"),
        col("udyam", "Udyam number"),
        col("stateCode", "State code", { example: "MH", note: "Two-letter code, e.g. MH, KA, DL" }),
        col("group", "Group name", { example: "Sharma Family", note: "Created if it does not exist" }),
        col("partner", "Partner username", { example: "arvind.mehta" }),
        col("manager", "Manager username", { example: "rohan.iyer" }),
        col("team", "Client team name", { example: "GST & Audit" }),
        col("booksBy", "Books maintained by", { example: "CLIENT", note: "FIRM or CLIENT" }),
        col("category", "Category", { example: "B", note: "A, B or C" }),
        col("onboardingDate", "Onboarding date", { example: "2026-04-01" }),
        ...FLAG_COLUMNS.map(([key, header]) => col(key, header, { example: key === "tdsApplicable" ? "Y" : "N", note: "Y or N" })),
        col("contactName", "Primary contact name", { example: "Amit Sharma" }),
        col("contactEmail", "Contact email", { example: "amit@example.com" }),
        col("contactPhone", "Contact mobile", { example: "9876543210" }),
      ],
    },
    {
      name: "GSTINs",
      columns: [
        col("ref", "Client ref", { required: true, example: "C1" }),
        col("gstin", "GSTIN", { required: true, example: "27AABCS1234K1Z5", width: 20 }),
        col("frequency", "Frequency", { required: true, example: "MONTHLY", note: GST_FREQUENCIES.join(", ") }),
        col("iff", "IFF opted", { example: "N" }),
        col("gstr9", "GSTR-9 applies", { example: "Y" }),
        col("gstr9c", "GSTR-9C applies", { example: "N" }),
      ],
    },
    {
      name: "Directors",
      columns: [
        col("ref", "Client ref", { required: true, example: "C1" }),
        col("din", "DIN", { required: true, example: "01234567" }),
        col("name", "Director name", { required: true, example: "Ramesh Sharma" }),
        col("designation", "Designation", { example: "DIRECTOR" }),
        col("appointedOn", "Appointed on", { example: "2018-04-01" }),
      ],
    },
    {
      name: "PT",
      columns: [
        col("ref", "Client ref", { required: true, example: "C1" }),
        col("stateCode", "State code", { required: true, example: "MH" }),
        col("registrationNo", "PT registration no."),
        col("effectiveFrom", "Effective from", { required: true, example: "2026-04-01" }),
      ],
    },
  ],
  instructions: [
    "Client import — fill the Clients sheet; GSTINs, Directors and PT sheets are optional and link to a client by 'Client ref'.",
    "Columns marked * are required. Delete the grey example row or overwrite it.",
    "Flags: Y or N. Statutory audit is always Y for companies. DPT-3 applies to companies only.",
    "Nothing is saved until you press Apply after a clean validation report. Each change is written to the audit trail.",
    "Compliance tasks for imported clients are generated by the compliance engine (Phase 2).",
  ],
  async validate(sheets) {
    const users = await userMap();
    const states = new Map((await db().state.findMany()).map((s) => [s.code, s]));
    const teams = new Set((await db().clientTeam.findMany()).map((t) => t.name));
    const existingPans = new Set((await db().client.findMany({ where: { pan: { not: null } }, select: { pan: true } })).map((c) => c.pan!));
    const existingGstins = new Set((await db().gSTIN.findMany({ select: { gstin: true } })).map((g) => g.gstin));
    const out: CheckedRow[] = [];
    const refs = new Map<string, { pan: string; constitution: string }>();
    const pansInFile = new Set<string>();
    for (const r of sheets.Clients ?? []) {
      const e: string[] = [];
      const d = r.data;
      const ref = req(d, "ref", "Client ref", e);
      req(d, "name", "Name", e);
      const constitution = upper(req(d, "constitution", "Constitution", e));
      if (constitution && !(CONSTITUTIONS as readonly string[]).includes(constitution)) e.push(`Constitution must be one of ${CONSTITUTIONS.join(", ")}`);
      const pan = upper(d.pan ?? "");
      if (pan && !PAN_RE.test(pan)) e.push("PAN format is AAAAA9999A");
      if (pan && existingPans.has(pan)) e.push("PAN already exists in the client master");
      if (pan && pansInFile.has(pan)) e.push("PAN repeated in this file");
      if (pan) pansInFile.add(pan);
      if (d.tan && !TAN_RE.test(upper(d.tan))) e.push("TAN format is AAAA99999A");
      if (d.stateCode && !states.has(upper(d.stateCode))) e.push("Unknown state code");
      for (const [k, label] of [["partner", "Partner"], ["manager", "Manager"]] as const) {
        const u = d[k] ? users.get(d[k]!.toLowerCase()) : null;
        if (d[k] && !u) e.push(`${label} username not found`);
        if (u && k === "partner" && u.role !== "PARTNER") e.push("Partner username is not a Partner");
        if (u && k === "manager" && !["MANAGER", "PARTNER"].includes(u.role)) e.push("Manager username is not a Manager");
      }
      if (d.team && !teams.has(d.team)) e.push("Client team not found");
      if (d.booksBy && !["FIRM", "CLIENT"].includes(upper(d.booksBy))) e.push("Books maintained by: FIRM or CLIENT");
      if (d.category && !["A", "B", "C"].includes(upper(d.category))) e.push("Category: A, B or C");
      dateOpt(d.onboardingDate ?? "", "Onboarding date", e);
      for (const [k, label] of FLAG_COLUMNS) yn(d[k] ?? "", e, label);
      if (YES.has((d.dpt3Applicable ?? "").toLowerCase()) && !isCompany(constitution)) e.push("DPT-3 applies to companies only");
      if (ref && refs.has(ref)) e.push("Client ref repeated");
      if (ref) refs.set(ref, { pan, constitution });
      out.push({ sheet: "Clients", rowNumber: r.rowNumber, data: d, errors: e });
    }
    const gstinsInFile = new Set<string>();
    for (const r of sheets.GSTINs ?? []) {
      const e: string[] = [];
      const d = r.data;
      const parent = refs.get(d.ref ?? "");
      if (!parent) e.push("Client ref not found on the Clients sheet");
      const g = upper(req(d, "gstin", "GSTIN", e));
      if (g && !isValidGstin(g)) e.push("GSTIN is not valid (format or check digit)");
      if (g && parent?.pan && g.slice(2, 12) !== parent.pan) e.push("GSTIN does not contain the client's PAN");
      if (g && !states.has([...states.values()].find((s) => s.gstCode === g.slice(0, 2))?.code ?? "")) e.push("Unknown state code in GSTIN");
      if (g && (existingGstins.has(g) || gstinsInFile.has(g))) e.push("GSTIN already exists");
      gstinsInFile.add(g);
      const f = upper(req(d, "frequency", "Frequency", e));
      if (f && !(GST_FREQUENCIES as readonly string[]).includes(f)) e.push(`Frequency: ${GST_FREQUENCIES.join(", ")}`);
      if (yn(d.iff ?? "", e, "IFF") && f !== "QRMP") e.push("IFF applies only to QRMP");
      const g9 = yn(d.gstr9 ?? "", e, "GSTR-9");
      if (yn(d.gstr9c ?? "", e, "GSTR-9C") && !g9) e.push("GSTR-9C needs GSTR-9");
      out.push({ sheet: "GSTINs", rowNumber: r.rowNumber, data: d, errors: e });
    }
    for (const r of sheets.Directors ?? []) {
      const e: string[] = [];
      const d = r.data;
      const parent = refs.get(d.ref ?? "");
      if (!parent) e.push("Client ref not found on the Clients sheet");
      if (parent && !["PRIVATE_COMPANY", "PUBLIC_COMPANY", "LLP"].includes(parent.constitution)) e.push("Directors apply to companies and LLPs only");
      if (!DIN_RE.test(req(d, "din", "DIN", e))) e.push("DIN is 8 digits");
      req(d, "name", "Director name", e);
      dateOpt(d.appointedOn ?? "", "Appointed on", e);
      out.push({ sheet: "Directors", rowNumber: r.rowNumber, data: d, errors: e });
    }
    for (const r of sheets.PT ?? []) {
      const e: string[] = [];
      const d = r.data;
      if (!refs.has(d.ref ?? "")) e.push("Client ref not found on the Clients sheet");
      const st = states.get(upper(req(d, "stateCode", "State code", e)));
      if (d.stateCode && !st) e.push("Unknown state code");
      if (st && !st.ptLevied) e.push(`${st.name} does not levy Professional Tax`);
      if (!dateOpt(req(d, "effectiveFrom", "Effective from", e), "Effective from", e)) e.push("Effective from is required");
      out.push({ sheet: "PT", rowNumber: r.rowNumber, data: d, errors: e });
    }
    return out;
  },
  preview(rows) {
    const clients = rows.filter((r) => r.sheet === "Clients");
    const lines = [`${clients.length} clients, ${rows.filter((r) => r.sheet === "GSTINs").length} GSTINs, ${rows.filter((r) => r.sheet === "Directors").length} director links, ${rows.filter((r) => r.sheet === "PT").length} PT registrations.`];
    for (const c of clients.slice(0, 50)) {
      const flags = FLAG_COLUMNS.filter(([k]) => YES.has((c.data[k] ?? "").toLowerCase())).map(([, l]) => l);
      lines.push(`${c.data.name}: ${flags.length ? flags.join(", ") : "no flags"}`);
    }
    lines.push("Compliance tasks will be generated from these flags by the compliance engine (Phase 2).");
    return lines;
  },
  async apply(actor, rows) {
    const users = await userMap();
    const teams = new Map((await db().clientTeam.findMany()).map((t) => [t.name, t.id]));
    const groups = new Map((await db().clientGroup.findMany()).map((g) => [g.name.toLowerCase(), g.id]));
    const idByRef = new Map<string, string>();
    let created = 0;
    for (const r of rows.filter((x) => x.sheet === "Clients")) {
      const d = r.data;
      let groupId: string | null = null;
      if (d.group) {
        groupId = groups.get(d.group.toLowerCase()) ?? null;
        if (!groupId) {
          groupId = (await createGroup(actor, d.group)).id;
          groups.set(d.group.toLowerCase(), groupId);
        }
      }
      const flags = Object.fromEntries(FLAG_COLUMNS.map(([k]) => [k, YES.has((d[k] ?? "").toLowerCase())])) as Record<ClientFlag, boolean>;
      const c = await createClient(actor, {
        name: d.name!, constitution: upper(d.constitution!) as never, pan: d.pan || null, tan: d.tan || null, cinLlpin: d.cinLlpin || null, udyam: d.udyam || null,
        stateCode: d.stateCode ? upper(d.stateCode) : null, groupId, partnerId: d.partner ? users.get(d.partner.toLowerCase())?.id ?? null : null,
        managerId: d.manager ? users.get(d.manager.toLowerCase())?.id ?? null : null, teamId: d.team ? teams.get(d.team) ?? null : null,
        booksBy: d.booksBy ? (upper(d.booksBy) as "FIRM" | "CLIENT") : "CLIENT", category: d.category ? (upper(d.category) as "A") : null,
        onboardingDate: d.onboardingDate || null, flags,
      });
      if (d.contactName) await saveContact(actor, c.id, { name: d.contactName, email: d.contactEmail || null, phone: d.contactPhone || null, isPrimary: true, isBilling: true });
      idByRef.set(d.ref!, c.id);
      created += 1;
    }
    for (const r of rows.filter((x) => x.sheet === "GSTINs")) {
      const d = r.data;
      await addGstin(actor, idByRef.get(d.ref!)!, {
        gstin: upper(d.gstin!), frequency: upper(d.frequency!) as never, iffOpted: YES.has((d.iff ?? "").toLowerCase()),
        annualReturnApplicable: YES.has((d.gstr9 ?? "").toLowerCase()), gstr9cApplicable: YES.has((d.gstr9c ?? "").toLowerCase()),
      });
    }
    for (const r of rows.filter((x) => x.sheet === "Directors")) {
      const d = r.data;
      await addDirector(actor, idByRef.get(d.ref!)!, { din: d.din!, name: d.name!, designation: d.designation || "DIRECTOR", appointedOn: d.appointedOn || null });
    }
    for (const r of rows.filter((x) => x.sheet === "PT")) {
      const d = r.data;
      await addPtRegistration(actor, idByRef.get(d.ref!)!, { stateCode: upper(d.stateCode!), registrationNo: d.registrationNo || null, effectiveFrom: d.effectiveFrom! });
    }
    return { created, notes: [] };
  },
};

// ---------------------------------------------------------------------------
// USERS and CLIENT TEAMS
// ---------------------------------------------------------------------------
const usersDef: ImportDef = {
  kind: "USERS",
  title: "Users (logins)",
  roles: ["PARTNER", "PRACTICE_ADMIN"],
  sheets: [{
    name: "Users",
    columns: [
      col("username", "Username", { required: true, example: "ravi.kumar" }),
      col("displayName", "Full name", { required: true, example: "Ravi Kumar" }),
      col("role", "Role", { required: true, example: "STAFF", note: ROLES.filter((r) => r !== "PORTAL").join(", ") }),
      col("isSenior", "Senior (can review)", { example: "N" }),
      col("email", "Email"), col("mobile", "Mobile"),
      col("reportingManager", "Reporting manager username", { example: "rohan.iyer" }),
      col("designation", "Designation", { example: "Associate" }),
      col("defaultLocation", "Default location", { example: "OFFICE", note: LOCATIONS.join(", ") }),
      col("locationChangeable", "Location changeable", { example: "Y" }),
    ],
  }],
  instructions: ["One row per person. Each gets a one-time temporary password shown after Apply (download the result).", "Partner, Practice Admin and HR Admin roles can be imported only by a Partner."],
  async validate(sheets) {
    const users = await userMap();
    const designations = new Set((await db().designation.findMany()).map((d) => d.name));
    const inFile = new Set<string>();
    return (sheets.Users ?? []).map((r) => {
      const e: string[] = [];
      const d = r.data;
      const u = req(d, "username", "Username", e).toLowerCase();
      if (u && !/^[a-z0-9._-]{3,40}$/.test(u)) e.push("Username: 3–40 letters, numbers, dot, dash or underscore");
      if (u && (users.has(u) || inFile.has(u))) e.push("Username already exists");
      inFile.add(u);
      req(d, "displayName", "Full name", e);
      const role = upper(req(d, "role", "Role", e));
      if (role && !ROLES.filter((x) => x !== "PORTAL").includes(role as never)) e.push("Unknown role");
      if (yn(d.isSenior ?? "", e, "Senior") && role === "ARTICLE") e.push("Articles cannot be Seniors");
      if (d.reportingManager && !users.has(d.reportingManager.toLowerCase()) && !inFile.has(d.reportingManager.toLowerCase())) e.push("Reporting manager not found");
      if (d.designation && !designations.has(d.designation)) e.push("Unknown designation");
      if (d.defaultLocation && !(LOCATIONS as readonly string[]).includes(upper(d.defaultLocation))) e.push(`Location: ${LOCATIONS.join(", ")}`);
      yn(d.locationChangeable ?? "", e, "Location changeable");
      return { sheet: "Users", rowNumber: r.rowNumber, data: d, errors: e };
    });
  },
  async apply(actor, rows) {
    const designations = new Map((await db().designation.findMany()).map((d) => [d.name, d.id]));
    const tempPasswords: { username: string; tempPassword: string }[] = [];
    for (const r of rows) {
      const d = r.data;
      const res = await createUser(actor, {
        username: d.username!, displayName: d.displayName!, role: upper(d.role!) as never, isSenior: YES.has((d.isSenior ?? "").toLowerCase()),
        email: d.email || null, mobile: d.mobile || null, designationId: d.designation ? designations.get(d.designation) ?? null : null,
        defaultLocation: (d.defaultLocation ? upper(d.defaultLocation) : "OFFICE") as never,
        locationChangeable: d.locationChangeable ? YES.has(d.locationChangeable.toLowerCase()) : true,
      });
      tempPasswords.push({ username: res.user.username, tempPassword: res.tempPassword });
    }
    // Second pass: reporting managers (may refer to people created in this file).
    const users = await userMap();
    for (const r of rows) {
      if (!r.data.reportingManager) continue;
      await db().user.update({ where: { username: r.data.username!.toLowerCase() }, data: { reportingManagerId: users.get(r.data.reportingManager.toLowerCase())!.id } });
    }
    return { created: rows.length, notes: ["Share each temporary password privately; it must be changed at first login."], tempPasswords };
  },
};

const teamsDef: ImportDef = {
  kind: "CLIENT_TEAMS",
  title: "Client teams",
  roles: ["PARTNER", "PRACTICE_ADMIN"],
  sheets: [{ name: "Teams", columns: [col("name", "Team name", { required: true, example: "GST & Audit" }), col("lead", "Lead manager username", { example: "rohan.iyer" }), col("members", "Member usernames", { example: "priya.nair, neha.gupta", note: "Comma-separated", width: 40 })] }],
  instructions: ["One row per team. Members are added to existing teams too (by name)."],
  async validate(sheets) {
    const users = await userMap();
    return (sheets.Teams ?? []).map((r) => {
      const e: string[] = [];
      req(r.data, "name", "Team name", e);
      const lead = r.data.lead ? users.get(r.data.lead.toLowerCase()) : null;
      if (r.data.lead && !lead) e.push("Lead username not found");
      if (lead && !["MANAGER", "PARTNER"].includes(lead.role)) e.push("Lead must be a Manager or Partner");
      for (const m of (r.data.members ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        const u = users.get(m);
        if (!u) e.push(`Member ${m} not found`);
        else if (u.role === "HR_ADMIN") e.push(`${m} is HR Admin and cannot join a client team`);
      }
      return { sheet: "Teams", rowNumber: r.rowNumber, data: r.data, errors: e };
    });
  },
  async apply(actor, rows) {
    const users = await userMap();
    let created = 0;
    for (const r of rows) {
      let team = await db().clientTeam.findUnique({ where: { name: r.data.name! } });
      if (!team) {
        team = await createTeam(actor, { name: r.data.name!, leadManagerId: r.data.lead ? users.get(r.data.lead.toLowerCase())!.id : null });
        created += 1;
      }
      for (const m of (r.data.members ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        await addTeamMember(actor, team.id, users.get(m)!.id);
      }
    }
    return { created, notes: [] };
  },
};

// ---------------------------------------------------------------------------
// HR: employees, salary structures, opening leave balances
// ---------------------------------------------------------------------------
const employeesDef: ImportDef = {
  kind: "EMPLOYEES",
  title: "Employee profiles",
  roles: ["PARTNER", "HR_ADMIN"],
  sheets: [{
    name: "Employees",
    columns: [
      col("username", "Username", { required: true, example: "ravi.kumar" }), col("employeeCategory", "Category", { example: "STAFF", note: "PARTNER, STAFF, ARTICLE, ADMIN, SUPPORT" }),
      col("dateOfBirth", "Date of birth"), col("gender", "Gender"), col("personalEmail", "Personal email"), col("personalMobile", "Personal mobile"),
      col("address", "Address", { width: 30 }), col("pan", "PAN"), col("aadhaar", "Aadhaar"), col("bankName", "Bank name"), col("bankAccount", "Bank account no."),
      col("bankIfsc", "IFSC"), col("uan", "UAN"), col("esiNumber", "ESI number"), col("qualifications", "Qualifications"),
      col("membershipBody", "Membership body", { note: "ICAI, ICSI or ICMAI" }), col("membershipNo", "Membership no."), col("joiningDate", "Joining date"), col("workStateCode", "Work state code", { example: "MH" }),
    ],
  }],
  instructions: ["PAN, Aadhaar and bank details are encrypted on save. Aadhaar is only ever shown masked."],
  async validate(sheets) {
    const users = await userMap();
    return (sheets.Employees ?? []).map((r) => {
      const e: string[] = [];
      const d = r.data;
      if (!users.has(req(d, "username", "Username", e).toLowerCase())) e.push("Username not found (import users first)");
      if (d.pan && !PAN_RE.test(upper(d.pan))) e.push("PAN format is AAAAA9999A");
      if (d.aadhaar && !/^[2-9][0-9]{11}$/.test(d.aadhaar.replace(/\s/g, ""))) e.push("Aadhaar is 12 digits");
      if (d.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(upper(d.bankIfsc))) e.push("IFSC format is wrong");
      if (d.bankAccount && !/^[0-9]{6,18}$/.test(d.bankAccount)) e.push("Bank account: 6–18 digits");
      dateOpt(d.dateOfBirth ?? "", "Date of birth", e);
      dateOpt(d.joiningDate ?? "", "Joining date", e);
      if (d.membershipBody && !["ICAI", "ICSI", "ICMAI"].includes(upper(d.membershipBody))) e.push("Membership body: ICAI, ICSI or ICMAI");
      return { sheet: "Employees", rowNumber: r.rowNumber, data: d, errors: e };
    });
  },
  async apply(actor, rows) {
    const users = await userMap();
    for (const r of rows) {
      const d = r.data;
      await upsertEmployeeProfile(actor, users.get(d.username!.toLowerCase())!.id, {
        employeeCategory: (d.employeeCategory ? upper(d.employeeCategory) : "STAFF") as never, dateOfBirth: d.dateOfBirth || null, gender: d.gender || null,
        personalEmail: d.personalEmail || null, personalMobile: d.personalMobile || null, address: d.address ?? "", pan: d.pan || null,
        aadhaar: d.aadhaar ? d.aadhaar.replace(/\s/g, "") : null, bankName: d.bankName || null, bankAccount: d.bankAccount || null,
        bankIfsc: d.bankIfsc || null, uan: d.uan || null, esiNumber: d.esiNumber || null, qualifications: d.qualifications ?? "",
        membershipBody: d.membershipBody ? (upper(d.membershipBody) as "ICAI") : null, membershipNo: d.membershipNo || null,
        joiningDate: d.joiningDate || null, workStateCode: d.workStateCode ? upper(d.workStateCode) : null,
      });
    }
    return { created: rows.length, notes: [] };
  },
};

const rupees = (v: string, label: string, e: string[], required = false) => {
  if (!v) {
    if (required) e.push(`${label} is required`);
    return 0;
  }
  const p = parseInrToPaise(v);
  if (p === null || p < 0) {
    e.push(`${label}: enter an amount in rupees`);
    return 0;
  }
  return p;
};

const salaryDef: ImportDef = {
  kind: "SALARY_STRUCTURES",
  title: "Salary structures (monthly, in ₹)",
  roles: ["PARTNER", "HR_ADMIN"],
  sheets: [{
    name: "Salary",
    columns: [
      col("username", "Username", { required: true, example: "ravi.kumar" }), col("effectiveFrom", "Effective from", { required: true, example: "2026-04-01" }),
      col("kind", "Kind", { example: "SALARY", note: "SALARY or STIPEND" }), col("basic", "Basic", { required: true, example: 30000 }), col("hra", "HRA", { example: 12000 }),
      col("special", "Special allowance", { example: 8000 }), col("other", "Other allowance", { example: 0 }), col("variable", "Variable (monthly)", { example: 0 }),
      col("regime", "Tax regime", { example: "NEW", note: "NEW or OLD" }),
    ],
  }],
  instructions: ["Imported structures are saved as DRAFT; a Partner approves them before payroll uses them (spec 11.5). Amounts are encrypted."],
  async validate(sheets) {
    const users = await userMap();
    return (sheets.Salary ?? []).map((r) => {
      const e: string[] = [];
      const d = r.data;
      if (!users.has(req(d, "username", "Username", e).toLowerCase())) e.push("Username not found");
      dateOpt(req(d, "effectiveFrom", "Effective from", e), "Effective from", e);
      rupees(d.basic ?? "", "Basic", e, true);
      for (const k of ["hra", "special", "other", "variable"]) rupees(d[k] ?? "", k, e);
      if (d.kind && !["SALARY", "STIPEND"].includes(upper(d.kind))) e.push("Kind: SALARY or STIPEND");
      if (d.regime && !["NEW", "OLD"].includes(upper(d.regime))) e.push("Regime: NEW or OLD");
      return { sheet: "Salary", rowNumber: r.rowNumber, data: d, errors: e };
    });
  },
  async apply(actor, rows) {
    const users = await userMap();
    await transaction(async (tx) => {
      for (const r of rows) {
        const d = r.data;
        const e: string[] = [];
        const components = { basic: rupees(d.basic!, "", e), hra: rupees(d.hra ?? "", "", e), special: rupees(d.special ?? "", "", e), other: rupees(d.other ?? "", "", e), variable: rupees(d.variable ?? "", "", e) };
        const gross = Object.values(components).reduce((a, b) => a + b, 0);
        const s = await tx.salaryStructure.create({
          data: {
            userId: users.get(d.username!.toLowerCase())!.id, effectiveFrom: d.effectiveFrom!, kind: d.kind ? upper(d.kind) : "SALARY",
            componentsEnc: encryptJson(components, "PII"), monthlyGrossPaiseEnc: encrypt(String(gross), "PII"), regime: d.regime ? upper(d.regime) : "NEW",
            status: "DRAFT", createdById: actor.kind === "PORTAL" ? null : actor.userId,
          },
        });
        await writeAudit(tx, actor, { entityType: "SalaryStructure", entityId: s.id, action: "IMPORT", after: { userId: s.userId, effectiveFrom: s.effectiveFrom, status: "DRAFT" } });
      }
    });
    return { created: rows.length, notes: ["Structures are DRAFT until a Partner approves them."] };
  },
};

const leaveDef: ImportDef = {
  kind: "LEAVE_BALANCES",
  title: "Opening leave balances",
  roles: ["PARTNER", "HR_ADMIN"],
  sheets: [{ name: "Leave", columns: [col("username", "Username", { required: true, example: "ravi.kumar" }), col("leaveType", "Leave type", { required: true, example: "PERSONAL" }), col("fy", "Financial year", { required: true, example: "FY2026-27" }), col("days", "Opening days", { required: true, example: 7.5, note: "Half days allowed (.5)" })] }],
  instructions: ["Opening balance per person, leave type and financial year. Re-importing the same row replaces the opening balance."],
  async validate(sheets) {
    const users = await userMap();
    return (sheets.Leave ?? []).map((r) => {
      const e: string[] = [];
      const d = r.data;
      if (!users.has(req(d, "username", "Username", e).toLowerCase())) e.push("Username not found");
      req(d, "leaveType", "Leave type", e);
      if (!/^FY\d{4}-\d{2}$/.test(req(d, "fy", "Financial year", e))) e.push("Financial year like FY2026-27");
      const days = Number(req(d, "days", "Opening days", e));
      if (Number.isNaN(days) || days < 0 || (days * 2) % 1 !== 0) e.push("Opening days: a number in half-day steps");
      return { sheet: "Leave", rowNumber: r.rowNumber, data: d, errors: e };
    });
  },
  async apply(actor, rows) {
    const users = await userMap();
    await transaction(async (tx) => {
      for (const r of rows) {
        const d = r.data;
        const userId = users.get(d.username!.toLowerCase())!.id;
        const leaveType = upper(d.leaveType!);
        const half = Math.round(Number(d.days) * 2);
        const row = await tx.leaveBalance.upsert({
          where: { userId_leaveType_fy: { userId, leaveType, fy: d.fy! } },
          create: { userId, leaveType, fy: d.fy!, openingHalfDays: half, createdById: actor.kind === "PORTAL" ? null : actor.userId },
          update: { openingHalfDays: half },
        });
        await writeAudit(tx, actor, { entityType: "LeaveBalance", entityId: row.id, action: "IMPORT", after: { leaveType, fy: d.fy, openingHalfDays: half } });
      }
    });
    return { created: rows.length, notes: [] };
  },
};

// ---------------------------------------------------------------------------
// Open receivables and leads
// ---------------------------------------------------------------------------
const receivablesDef: ImportDef = {
  kind: "RECEIVABLES",
  title: "Open receivables (opening invoices)",
  roles: ["PARTNER", "PRACTICE_ADMIN"],
  sheets: [{
    name: "Receivables",
    columns: [
      col("client", "Client code or PAN", { required: true, example: "CL-0001" }), col("number", "Invoice number", { required: true, example: "QI/25-26/0412" }),
      col("date", "Invoice date", { required: true, example: "2026-02-15" }), col("amount", "Invoice total (₹)", { required: true, example: 59000 }),
      col("received", "Received so far (₹)", { example: 0 }), col("engagement", "Engagement code"),
    ],
  }],
  instructions: ["Opening balances from your previous system. Each row becomes a RAISED (or PARTLY_RECEIVED) invoice so ageing works from day one."],
  async validate(sheets) {
    const clients = await db().client.findMany({ select: { id: true, code: true, pan: true } });
    const existing = new Set((await db().invoice.findMany({ where: { number: { not: null } }, select: { number: true } })).map((i) => i.number!));
    const inFile = new Set<string>();
    return (sheets.Receivables ?? []).map((r) => {
      const e: string[] = [];
      const d = r.data;
      const ref = upper(req(d, "client", "Client", e));
      if (ref && !clients.some((c) => c.code === ref || c.pan === ref)) e.push("Client code / PAN not found");
      const n = req(d, "number", "Invoice number", e);
      if (n && (existing.has(n) || inFile.has(n))) e.push("Invoice number already exists");
      inFile.add(n);
      dateOpt(req(d, "date", "Invoice date", e), "Invoice date", e);
      const amt = rupees(d.amount ?? "", "Invoice total", e, true);
      if (rupees(d.received ?? "", "Received", e) > amt) e.push("Received is more than the invoice total");
      return { sheet: "Receivables", rowNumber: r.rowNumber, data: d, errors: e };
    });
  },
  async apply(actor, rows) {
    const clients = await db().client.findMany({ select: { id: true, code: true, pan: true } });
    const engagements = new Map((await db().engagement.findMany({ select: { id: true, code: true } })).map((e) => [e.code, e.id]));
    await transaction(async (tx) => {
      for (const r of rows) {
        const d = r.data;
        const e: string[] = [];
        const ref = upper(d.client!);
        const client = clients.find((c) => c.code === ref || c.pan === ref)!;
        const total = rupees(d.amount!, "", e);
        const received = rupees(d.received ?? "", "", e);
        const inv = await tx.invoice.create({
          data: {
            number: d.number!, clientId: client.id, engagementId: d.engagement ? engagements.get(upper(d.engagement)) ?? null : null, date: d.date!,
            status: received > 0 ? "PARTLY_RECEIVED" : "RAISED", taxablePaise: total, totalPaise: total, receivedPaise: received,
            notes: "Opening balance (imported)", raisedAt: new Date(), createdById: actor.kind === "PORTAL" ? null : actor.userId,
          },
        });
        await writeAudit(tx, actor, { entityType: "Invoice", entityId: inv.id, action: "IMPORT", after: { number: inv.number, totalPaise: total, receivedPaise: received } });
      }
    });
    return { created: rows.length, notes: [] };
  },
};

const leadsDef: ImportDef = {
  kind: "LEADS",
  title: "Leads",
  roles: ["PARTNER", "PRACTICE_ADMIN"],
  sheets: [{
    name: "Leads",
    columns: [
      col("name", "Lead name", { required: true, example: "Nashik Agro Foods" }), col("entityType", "Entity type", { example: "PRIVATE_COMPANY" }), col("contactName", "Contact name"),
      col("email", "Email"), col("phone", "Phone"), col("pan", "PAN"), col("gstin", "GSTIN"), col("services", "Services wanted", { example: "GST, ITR" }),
      col("estFee", "Estimated fee (₹)", { example: 50000 }), col("source", "Source", { example: "REFERRAL", note: "REFERRAL, EXISTING_CLIENT, WEBSITE, EVENT, OTHER" }),
      col("owner", "Owner username", { example: "rohan.iyer" }), col("stage", "Stage", { example: "NEW" }), col("nextFollowUp", "Next follow-up"),
    ],
  }],
  instructions: ["Leads with a PAN or GSTIN already in the client master are flagged as duplicates."],
  async validate(sheets) {
    const users = await userMap();
    const clientPans = new Set((await db().client.findMany({ where: { pan: { not: null } }, select: { pan: true } })).map((c) => c.pan!));
    const STAGES = ["NEW", "CONTACTED", "MEETING", "PROPOSAL_SENT", "WON", "LOST", "ON_HOLD"];
    const SOURCES = ["REFERRAL", "EXISTING_CLIENT", "WEBSITE", "EVENT", "OTHER"];
    return (sheets.Leads ?? []).map((r) => {
      const e: string[] = [];
      const d = r.data;
      req(d, "name", "Lead name", e);
      if (d.pan && !PAN_RE.test(upper(d.pan))) e.push("PAN format is AAAAA9999A");
      if (d.pan && clientPans.has(upper(d.pan))) e.push("PAN belongs to an existing client");
      if (d.gstin && !isValidGstin(upper(d.gstin))) e.push("GSTIN is not valid");
      rupees(d.estFee ?? "", "Estimated fee", e);
      if (d.source && !SOURCES.includes(upper(d.source))) e.push(`Source: ${SOURCES.join(", ")}`);
      if (d.stage && !STAGES.includes(upper(d.stage))) e.push(`Stage: ${STAGES.join(", ")}`);
      if (d.owner && !users.has(d.owner.toLowerCase())) e.push("Owner username not found");
      dateOpt(d.nextFollowUp ?? "", "Next follow-up", e);
      return { sheet: "Leads", rowNumber: r.rowNumber, data: d, errors: e };
    });
  },
  async apply(actor, rows) {
    const users = await userMap();
    await transaction(async (tx) => {
      for (const r of rows) {
        const d = r.data;
        const e: string[] = [];
        const lead = await tx.lead.create({
          data: {
            name: d.name!, searchName: toSearch(d.name, d.pan), entityType: d.entityType ? upper(d.entityType) : "OTHER", contactName: d.contactName ?? "",
            email: d.email || null, phone: d.phone || null, pan: d.pan ? upper(d.pan) : null, gstin: d.gstin ? upper(d.gstin) : null,
            servicesCsv: d.services ?? "", estFeePaise: rupees(d.estFee ?? "", "", e), source: d.source ? upper(d.source) : "OTHER",
            ownerId: d.owner ? users.get(d.owner.toLowerCase())?.id ?? null : null, stage: d.stage ? upper(d.stage) : "NEW",
            nextFollowUp: d.nextFollowUp || null, createdById: actor.kind === "PORTAL" ? null : actor.userId,
          },
        });
        await writeAudit(tx, actor, { entityType: "Lead", entityId: lead.id, action: "IMPORT", after: { name: lead.name } });
      }
    });
    return { created: rows.length, notes: [] };
  },
};

export const IMPORT_DEFS: Record<ImportKind, ImportDef> = {
  CLIENTS: clientsDef, USERS: usersDef, CLIENT_TEAMS: teamsDef, EMPLOYEES: employeesDef,
  SALARY_STRUCTURES: salaryDef, LEAVE_BALANCES: leaveDef, RECEIVABLES: receivablesDef, LEADS: leadsDef,
};
export const IMPORT_KINDS = Object.keys(IMPORT_DEFS) as ImportKind[];
export { CLIENT_FLAGS };
