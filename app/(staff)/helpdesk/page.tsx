import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { handledQueues, listQueue, myTickets, handlerOptions, CATEGORIES } from "@/server/services/helpdesk/service";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RaiseTicketDialog } from "./raise-dialog";
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE } from "./labels";

export const metadata = { title: "Helpdesk" };

type SP = { tab?: string; status?: string; category?: string; assignee?: string; q?: string; long?: string };

export default async function HelpdeskPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  requireCap(actor, "helpdesk.raise");
  const sp = await searchParams;
  const queues = handledQueues(actor);
  const tab = queues.length && sp.tab === "queue" ? "queue" : "mine";
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Helpdesk" subtitle="Ask for help with the app, report a problem, or raise an HR query." actions={<RaiseTicketDialog />} />
      {queues.length ? (
        <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Views">
          {([["mine", "My tickets"], ["queue", queues.length === 1 && queues[0] === "HR" ? "HR queue" : "Queue"]] as const).map(([k, l]) => (
            <Link key={k} href={k === "mine" ? "/helpdesk" : "/helpdesk?tab=queue"} aria-current={tab === k ? "page" : undefined}
              className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === k ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>{l}</Link>
          ))}
        </nav>
      ) : null}
      {tab === "mine" ? <Mine /> : <Queue sp={sp} queues={queues} />}
    </div>
  );
}

async function Mine() {
  const actor = await requireStaff();
  const rows = await load(() => myTickets(actor));
  return (
    <Card>
      {rows.length === 0 ? <EmptyState title="No tickets yet">Raise a ticket when something does not work or you need help.</EmptyState> : (
        <ul className="divide-y divide-line">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="font-mono text-xs text-muted">#{t.number}</span>
              <Link href={`/helpdesk/${t.id}`} className="font-medium text-brand hover:underline">{t.subject}</Link>
              <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{STATUS_LABELS[t.status] ?? t.status}</Badge>
              <Badge>{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
              <span className="text-xs text-muted">Updated {formatDateTime(t.updatedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function Queue({ sp, queues }: { sp: SP; queues: string[] }) {
  const actor = await requireStaff();
  const categories = queues.includes("ADMIN") ? CATEGORIES.filter((c) => queues.includes("HR") || c !== "HR_QUERY") : ["HR_QUERY"];
  const [rows, handlers] = await Promise.all([
    load(() => listQueue(actor, { status: sp.status, category: sp.category, assigneeId: sp.assignee, q: sp.q, longOpenOnly: sp.long === "1" })),
    Promise.all(queues.map((q) => handlerOptions(actor, q))).then((l) => [...new Map(l.flat().map((h) => [h.id, h])).values()]),
  ]);
  return (
    <div className="space-y-3">
      <form className="grid gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_auto_auto_auto_auto_auto]" role="search">
        <input type="hidden" name="tab" value="queue" />
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search subject or description" aria-label="Search" />
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">Not closed</option>
          {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          <option value="ALL">All</option>
        </Select>
        <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </Select>
        <Select name="assignee" defaultValue={sp.assignee ?? ""} aria-label="Assignee">
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {handlers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </Select>
        <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="long" value="1" defaultChecked={sp.long === "1"} /> Long-open only</label>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <Table>
          <THead><tr><TH>#</TH><TH>Subject</TH><TH>Category</TH><TH>Raised by</TH><TH>Status</TH><TH>Assignee</TH><TH>Raised</TH></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={7} className="text-muted">No tickets match.</TD></TR> : null}
            {rows.map((t) => (
              <TR key={t.id} className={t.longOpen ? "bg-amber-50/60" : undefined}>
                <TD className="font-mono text-xs">{t.number}</TD>
                <TD><Link href={`/helpdesk/${t.id}`} className="text-brand hover:underline">{t.subject}</Link>{t.longOpen ? <> <Badge tone="amber">Long open</Badge></> : null}{t.faqArticleId ? <> <Badge tone="brand">FAQ</Badge></> : null}</TD>
                <TD>{CATEGORY_LABELS[t.category] ?? t.category}</TD>
                <TD>{t.raisedByName}</TD>
                <TD><Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{STATUS_LABELS[t.status] ?? t.status}</Badge>{t.reopenedCount ? <span className="ml-1 text-xs text-muted">reopened ×{t.reopenedCount}</span> : null}</TD>
                <TD>{t.assigneeName || <span className="text-muted">—</span>}</TD>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(t.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
