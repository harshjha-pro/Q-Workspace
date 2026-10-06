import { requireStaff } from "@/server/context";
import { can, scopeOf } from "@/server/permissions/guards";
import { userWhere } from "@/server/permissions/scopes";
import { requireCap } from "@/lib/page";
import { db } from "@/server/lib/db";
import { todayIst } from "@/server/lib/dates";
import { PageHeader } from "@/components/ui/card";
import type { Capability } from "@/server/permissions/matrix";
import type { ExportKind } from "@/server/services/exports/service";
import { clientOptions } from "../registers/_lib/pickers";
import { ExportForm, type KindOption } from "./export-form";

export const metadata = { title: "Exports" };

/** What each export holds and which screen's permission it follows (the server re-checks scope). */
const KINDS: { kind: ExportKind; label: string; cap: Capability; dated: boolean; byClient: boolean }[] = [
  { kind: "entries", label: "Work entries (time)", cap: "work.log", dated: true, byClient: true },
  { kind: "tasks", label: "Tasks by due date", cap: "task.view", dated: true, byClient: true },
  { kind: "filings", label: "Filings done (by filed date)", cap: "task.view", dated: true, byClient: true },
  { kind: "notices", label: "Notice register", cap: "notice.view", dated: false, byClient: true },
  { kind: "dsc", label: "DSC register", cap: "dsc.view", dated: false, byClient: true },
  { kind: "udin", label: "UDIN register", cap: "udin.record", dated: false, byClient: false },
  { kind: "inward", label: "Inward / outward register", cap: "inwardOutward.manage", dated: false, byClient: true },
];

export default async function ExportsPage() {
  const actor = await requireStaff();
  requireCap(actor, "export.run");
  const kinds: KindOption[] = KINDS.filter((k) => can(actor, k.cap)).map(({ kind, label, dated, byClient }) => ({ kind, label, dated, byClient }));
  const othersScope = scopeOf(actor, "work.viewOthers");
  const [clients, people] = await Promise.all([
    can(actor, "client.view") ? clientOptions(actor, "client.view") : Promise.resolve([]),
    othersScope !== "none"
      ? db().user.findMany({ where: { AND: [userWhere(actor, othersScope), { active: true, isSystem: false }] }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } })
      : Promise.resolve([]),
  ]);
  const today = todayIst();
  const monthStart = `${today.slice(0, 8)}01`;

  return (
    <div className="space-y-4">
      <PageHeader title="Exports" subtitle="Download CSV or Excel for your own records or for accounting. You can only export what you can see on screen; every export is logged." />
      <ExportForm kinds={kinds} clients={clients} people={people.map((p) => ({ id: p.id, name: p.displayName }))} defaultFrom={monthStart} defaultTo={today} />
    </div>
  );
}
