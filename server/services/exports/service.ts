import { db } from "../../lib/db";
import { authorize, scopeOf } from "../../permissions/guards";
import { taskWhere, workEntryWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { requireStaff } from "../../permissions/guards";
import { forbidden } from "../../lib/errors";
import { buildSheet, type Column } from "../../excel/workbook";
import { toCsv } from "../../lib/csv";
import { writeAudit } from "../../audit";
import { transaction } from "../../lib/db";
import { listNotices } from "../registers/notices";
import { listDscs } from "../registers/dsc";
import { listUdins } from "../registers/udin";
import { listInwardOutward } from "../registers/inward";

export const EXPORT_KINDS = ["entries", "tasks", "filings", "notices", "dsc", "udin", "inward"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export type ExportFilter = { from?: string; to?: string; clientId?: string; userId?: string };
type Table = { name: string; columns: Column[]; rows: Record<string, unknown>[] };

const clientNameMap = async (ids: string[]) => new Map((await db().client.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
const hours = (m: number) => Math.round((m / 60) * 100) / 100;

/**
 * Scoped exports (P2-35; replaces accounting/BI integrations, brief §4): every export uses the same
 * record scope as the screen it comes from, so nobody can export what they cannot see.
 */
async function table(actor: Actor, kind: ExportKind, f: ExportFilter): Promise<Table> {
  requireStaff(actor);
  const range = (field: string) => (f.from || f.to ? { [field]: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {});
  switch (kind) {
    case "entries": {
      const scope = scopeOf(actor, "work.viewOthers");
      const where = scope === "none" || (f.userId ?? actor.userId) === actor.userId ? { userId: actor.userId } : workEntryWhere(actor, scope);
      const rows = await db().workEntry.findMany({
        where: { AND: [where, { deletedAt: null }, range("date"), f.clientId ? { clientId: f.clientId } : {}, f.userId ? { userId: f.userId } : {}] },
        include: { user: { select: { displayName: true } }, client: { select: { code: true, name: true } }, engagement: { select: { name: true } }, task: { select: { title: true } }, internalCategory: { select: { name: true } } },
        orderBy: [{ date: "asc" }],
        take: 100_000,
      });
      return {
        name: "Work entries",
        columns: [
          { key: "date", header: "Date" }, { key: "person", header: "Person", width: 22 }, { key: "clientCode", header: "Client code" }, { key: "client", header: "Client", width: 30 },
          { key: "engagement", header: "Engagement", width: 26 }, { key: "task", header: "Task", width: 30 }, { key: "stage", header: "Stage" }, { key: "category", header: "Internal category" },
          { key: "hours", header: "Hours" }, { key: "chargeable", header: "Chargeable" }, { key: "location", header: "Location" }, { key: "outcome", header: "Outcome ref" }, { key: "description", header: "Description", width: 40 },
        ],
        rows: rows.map((e) => ({
          date: e.date, person: e.user.displayName, clientCode: e.client?.code ?? "", client: e.client?.name ?? "", engagement: e.engagement?.name ?? "", task: e.task?.title ?? "",
          stage: e.stageName ?? "", category: e.internalCategory?.name ?? "", hours: hours(e.minutes), chargeable: e.chargeable ? "Yes" : "No", location: e.location,
          outcome: e.outcomeRef ? `${e.outcomeType ?? ""} ${e.outcomeRef}`.trim() : "", description: e.description,
        })),
      };
    }
    case "tasks":
    case "filings": {
      const scope = authorize(actor, "task.view");
      const rows = await db().task.findMany({
        where: { AND: [taskWhere(actor, scope), f.clientId ? { clientId: f.clientId } : {}, kind === "filings" ? { status: { in: ["FILED", "FILED_LATE"] }, ...range("filedDate") } : range("effectiveDueDate")] },
        include: { client: { select: { code: true, name: true } }, assignments: { where: { toDate: null }, select: { role: true, userId: true } } },
        orderBy: { effectiveDueDate: "asc" },
        take: 100_000,
      });
      const names = new Map((await db().user.findMany({ select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
      const who = (t: (typeof rows)[number], role: string) => t.assignments.filter((a) => a.role === role).map((a) => names.get(a.userId)).join(", ");
      return {
        name: kind === "filings" ? "Filings" : "Tasks",
        columns: [
          { key: "clientCode", header: "Client code" }, { key: "client", header: "Client", width: 30 }, { key: "title", header: "Task", width: 34 }, { key: "period", header: "Period" },
          { key: "due", header: "Due date" }, { key: "status", header: "Status" }, { key: "assignee", header: "Assignee", width: 20 }, { key: "checker", header: "Checker", width: 20 },
          { key: "filed", header: "Filed on" }, { key: "ack", header: "Acknowledgement", width: 22 }, { key: "late", header: "Days late" },
        ],
        rows: rows.map((t) => ({
          clientCode: t.client.code, client: t.client.name, title: t.title, period: t.periodLabel || t.periodKey, due: t.effectiveDueDate ?? "", status: t.status.replace(/_/g, " "),
          assignee: who(t, "ASSIGNEE"), checker: who(t, "CHECKER"), filed: t.filedDate ?? "", ack: t.ackNumber ? `${t.ackType ?? ""} ${t.ackNumber}`.trim() : "",
          late: t.filedDate && t.effectiveDueDate && t.filedDate > t.effectiveDueDate ? Math.round((Date.parse(t.filedDate) - Date.parse(t.effectiveDueDate)) / 86_400_000) : "",
        })),
      };
    }
    case "notices": {
      const rows = (await listNotices(actor, { status: "ALL", clientId: f.clientId })).filter((n) => (!f.from || n.receivedDate >= f.from) && (!f.to || n.receivedDate <= f.to));
      const names = await clientNameMap(rows.map((n) => n.clientId));
      return {
        name: "Notices",
        columns: [{ key: "client", header: "Client", width: 30 }, { key: "authority", header: "Authority" }, { key: "section", header: "Section" }, { key: "ay", header: "AY / period" }, { key: "ref", header: "Reference / DIN" }, { key: "received", header: "Received" }, { key: "due", header: "Response due" }, { key: "status", header: "Status" }],
        rows: rows.map((n) => ({ client: names.get(n.clientId) ?? "", authority: n.authority, section: n.section, ay: n.ayOrPeriod, ref: n.referenceNo, received: n.receivedDate, due: n.responseDueDate ?? "", status: n.status })),
      };
    }
    case "dsc": {
      const rows = await listDscs(actor, { clientId: f.clientId });
      return {
        name: "DSC register",
        columns: [{ key: "holder", header: "Holder", width: 24 }, { key: "clients", header: "Clients", width: 30 }, { key: "type", header: "Type" }, { key: "expiry", header: "Expiry" }, { key: "state", header: "Expiry state" }, { key: "custody", header: "Custody" }, { key: "location", header: "Location" }],
        rows: rows.map((d) => ({ holder: d.holderName, clients: d.clientNames.join(", "), type: d.dscType, expiry: d.expiryDate, state: d.state, custody: d.custody, location: d.location })),
      };
    }
    case "udin": {
      const rows = (await listUdins(actor)).filter((u) => (!f.clientId || u.clientId === f.clientId) && (!f.from || u.signingDate >= f.from) && (!f.to || u.signingDate <= f.to));
      return {
        name: "UDIN register",
        columns: [{ key: "client", header: "Client", width: 30 }, { key: "doc", header: "Document", width: 26 }, { key: "signed", header: "Signed" }, { key: "partner", header: "Partner" }, { key: "udin", header: "UDIN", width: 22 }, { key: "generated", header: "Generated on" }, { key: "status", header: "Status" }],
        rows: rows.map((u) => ({ client: u.clientName, doc: u.documentType, signed: u.signingDate, partner: u.partnerName, udin: u.udin ?? "", generated: u.generatedOn ?? "", status: u.status })),
      };
    }
    case "inward": {
      const rows = (await listInwardOutward(actor, { clientId: f.clientId })).filter((r) => (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to));
      const names = await clientNameMap(rows.map((r) => r.clientId));
      return {
        name: "Inward-outward",
        columns: [{ key: "date", header: "Date" }, { key: "direction", header: "In/Out" }, { key: "client", header: "Client", width: 30 }, { key: "doc", header: "Document", width: 34 }, { key: "location", header: "Location" }, { key: "returned", header: "Returned" }],
        rows: rows.map((r) => ({ date: r.date, direction: r.direction, client: names.get(r.clientId) ?? "", doc: r.documentDesc, location: r.currentLocation, returned: r.returnedAt ? "Yes" : "No" })),
      };
    }
  }
}

export async function runExport(actor: Actor, kind: ExportKind, format: "csv" | "xlsx", f: ExportFilter = {}) {
  if (!EXPORT_KINDS.includes(kind)) throw forbidden();
  authorize(actor, "export.run");
  const t = await table(actor, kind, f);
  const body = format === "csv" ? Buffer.from(toCsv(t.columns.map((c) => c.header), t.rows.map((r) => t.columns.map((c) => r[c.key])))) : await buildSheet(t.name, t.columns, t.rows);
  const fileName = `qepex-${kind}-${new Date().toISOString().slice(0, 10)}.${format}`;
  await transaction(async (tx) => {
    await writeAudit(tx, actor, { entityType: "Export", entityId: kind, action: "EXPORT", after: { kind, format, rows: t.rows.length, filter: f } });
    await tx.exportJob.create({ data: { kind: `${kind.toUpperCase()}_${format.toUpperCase()}`, rowCount: t.rows.length, fileName, createdById: actor.kind === "USER" ? actor.userId : null } });
  });
  return { body, fileName, rows: t.rows.length, contentType: format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
