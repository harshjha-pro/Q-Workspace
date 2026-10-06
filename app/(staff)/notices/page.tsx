import { requireStaff } from "@/server/context";
import { listNotices, AUTHORITIES, NOTICE_STATUSES } from "@/server/services/registers/notices";
import { can } from "@/server/permissions/guards";
import { requireCap } from "@/lib/page";
import { diffDays, todayIst } from "@/server/lib/dates";
import { PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { clientOptions, clientNames, peopleOptions } from "../registers/_lib/pickers";
import { AUTHORITY_LABELS, NOTICE_STATUS_LABELS } from "./labels";
import { NoticesTable, type NoticeRow } from "./notices-table";
import { NewNoticeDialog } from "./new-notice";

export const metadata = { title: "Notices" };

type SP = { status?: string; authority?: string; clientId?: string };

export default async function NoticesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  requireCap(actor, "notice.view");
  const sp = await searchParams;
  const status = NOTICE_STATUSES.includes(sp.status as never) ? sp.status : undefined;
  const authority = AUTHORITIES.includes(sp.authority as never) ? sp.authority : undefined;
  const rows = await listNotices(actor, { status, authority, clientId: sp.clientId || undefined });
  const canManage = can(actor, "notice.manage");
  const [names, filterClients, manageClients, people] = await Promise.all([
    clientNames(rows.map((r) => r.clientId)),
    clientOptions(actor, "notice.view"),
    canManage ? clientOptions(actor, "notice.manage") : Promise.resolve([]),
    canManage ? peopleOptions(["PARTNER", "MANAGER", "STAFF", "ARTICLE"]) : Promise.resolve([]),
  ]);
  const today = todayIst();
  const data: NoticeRow[] = rows.map((n) => ({
    id: n.id, authority: n.authority, section: n.section, ay: n.ayOrPeriod, client: names.get(n.clientId) ?? "", clientId: n.clientId,
    received: n.receivedDate, due: n.responseDueDate ?? "", dueDays: n.responseDueDate && n.status !== "CLOSED" ? diffDays(today, n.responseDueDate) : null,
    nextHearing: n.hearings[0]?.date ?? "", status: n.status, referenceNo: n.referenceNo,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notices"
        subtitle="Notices from the department, with response due dates and hearings. Open notices are shown unless you pick a status."
        actions={canManage ? <NewNoticeDialog authorities={[...AUTHORITIES]} clients={manageClients} people={people} today={today} /> : null}
      />
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white p-3">
        <label className="text-xs font-medium text-ink">
          Status
          <Select name="status" defaultValue={status ?? ""} className="mt-1 w-40">
            <option value="">Open (not closed)</option>
            {NOTICE_STATUSES.map((s) => <option key={s} value={s}>{NOTICE_STATUS_LABELS[s]}</option>)}
          </Select>
        </label>
        <label className="text-xs font-medium text-ink">
          Authority
          <Select name="authority" defaultValue={authority ?? ""} className="mt-1 w-40">
            <option value="">All</option>
            {AUTHORITIES.map((a) => <option key={a} value={a}>{AUTHORITY_LABELS[a]}</option>)}
          </Select>
        </label>
        <label className="text-xs font-medium text-ink">
          Client
          <Select name="clientId" defaultValue={sp.clientId ?? ""} className="mt-1 w-56 max-w-full">
            <option value="">All clients</option>
            {filterClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <Button type="submit" size="sm" variant="secondary">Apply</Button>
      </form>
      <NoticesTable rows={data} />
    </div>
  );
}
