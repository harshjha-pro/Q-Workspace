import Link from "next/link";
import { requireStaff } from "@/server/context";
import { groupByDue, listTasks } from "@/server/services/tasks/service";
import { listClients } from "@/server/services/clients/service";
import { listEngagements } from "@/server/services/engagements/service";
import { listUserOptions } from "@/server/services/users/service";
import { can, scopeOf } from "@/server/permissions/guards";
import { load, requireCap } from "@/lib/page";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SERVICE_LINES, SERVICE_LINE_LABELS, TASK_STATUSES } from "@/server/domain/enums";
import { todayIst } from "@/server/lib/dates";
import { TASK_STATUS_LABELS, OPEN_STATUSES } from "./task-bits";
import { TaskList, type TaskGroup, type TaskRow } from "./task-list";
import { NewTaskDialog } from "./new-task-dialog";

export const metadata = { title: "Tasks" };

type SP = { mine?: string; status?: string; serviceLine?: string; assigneeId?: string; clientId?: string; q?: string; closed?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  requireCap(actor, "task.view");
  const sp = await searchParams;
  const today = todayIst();
  const wide = ["firm", "team", "firm_read"].includes(scopeOf(actor, "task.view"));
  const doesWork = ["PARTNER", "MANAGER", "STAFF", "ARTICLE"].includes(actor.role);
  // Default: people who do client work see their own tasks; admins see everything in scope.
  const mine = wide ? (sp.mine === undefined ? doesWork : sp.mine === "1") : false;
  const canBulk = can(actor, "task.bulk");
  const canSeeClients = can(actor, "client.view");

  const [tasks, clients, people, engagements] = await Promise.all([
    load(() => listTasks(actor, {
      mine, status: sp.status || undefined, serviceLine: sp.serviceLine || undefined, assigneeId: sp.assigneeId || undefined,
      clientId: sp.clientId || undefined, q: sp.q || undefined, includeClosed: sp.closed === "1",
    })),
    canSeeClients ? listClients(actor, { take: 1000 }) : Promise.resolve([]),
    wide ? listUserOptions(actor, ["PARTNER", "MANAGER", "STAFF", "ARTICLE"]) : Promise.resolve([]),
    canBulk ? listEngagements(actor, { status: "ACTIVE" }) : Promise.resolve([]),
  ]);

  const toRow = (t: (typeof tasks)[number]): TaskRow => ({
    id: t.id, title: t.title, client: t.client.name, clientId: t.client.id, period: t.periodLabel, due: t.effectiveDueDate, status: t.status,
    provisional: t.isProvisional, holidayShifted: t.holidayShifted,
    assignees: [...new Set(t.assignments.filter((a) => a.role === "ASSIGNEE" || a.role === "MAKER").map((a) => a.user.displayName))].join(", "),
    checker: t.assignments.filter((a) => a.role === "CHECKER").map((a) => a.user.displayName).join(", "),
    pendingSince: t.pendingSince,
  });
  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const closed = tasks.filter((t) => !OPEN_STATUSES.includes(t.status));
  const g = groupByDue(open, today);
  const groups: TaskGroup[] = [
    { key: "overdue", label: "Overdue", rows: g.overdue.map(toRow), tone: "overdue" },
    { key: "thisWeek", label: "This week", rows: g.thisWeek.map(toRow) },
    { key: "nextWeek", label: "Next week", rows: g.nextWeek.map(toRow) },
    { key: "later", label: "Later", rows: g.later.map(toRow) },
    { key: "noDate", label: "No date", rows: g.noDate.map(toRow) },
    { key: "closed", label: "Closed", rows: closed.map(toRow) },
  ];

  const makers = people.filter((p) => p.role !== "PRACTICE_ADMIN" && p.role !== "HR_ADMIN").map((p) => ({ id: p.id, name: `${p.displayName} (${p.role.toLowerCase()}${p.isSenior ? ", senior" : ""})` }));
  const checkers = people.filter((p) => p.role === "PARTNER" || p.role === "MANAGER" || (p.role === "STAFF" && p.isSenior)).map((p) => ({ id: p.id, name: `${p.displayName} (${p.role.toLowerCase()}${p.isSenior ? ", senior" : ""})` }));
  const tabHref = (m: boolean) => {
    const q = new URLSearchParams(Object.entries({ ...sp, mine: m ? "1" : "0" }).filter(([, v]) => v) as [string, string][]);
    return `/tasks?${q.toString()}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Tasks" subtitle={`${open.length} open${closed.length ? ` · ${closed.length} closed` : ""}`}
        actions={canBulk ? <NewTaskDialog clients={clients.map((c) => ({ id: c.id, name: `${c.name} (${c.code})` }))} engagements={engagements.map((e) => ({ id: e.id, name: e.name, clientId: e.client.id }))} people={makers} /> : null} />

      {wide ? (
        <nav aria-label="Whose tasks" className="inline-flex rounded-md border border-line bg-white p-0.5 text-sm">
          {[{ m: true, label: "Mine" }, { m: false, label: "All in scope" }].map((t) => (
            <Link key={t.label} href={tabHref(t.m)} aria-current={mine === t.m ? "page" : undefined}
              className={cn("rounded px-3 py-1", mine === t.m ? "bg-brand text-white" : "text-ink hover:bg-gray-50")}>{t.label}</Link>
          ))}
        </nav>
      ) : null}

      <form method="get" className="grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
        {wide ? <input type="hidden" name="mine" value={mine ? "1" : "0"} /> : null}
        <div className="lg:col-span-2">
          <Label htmlFor="f-q">Search</Label>
          <Input id="f-q" type="search" name="q" defaultValue={sp.q} placeholder="Task or client name" />
        </div>
        <div>
          <Label htmlFor="f-status">Status</Label>
          <Select id="f-status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">All open</option>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-sl">Service line</Label>
          <Select id="f-sl" name="serviceLine" defaultValue={sp.serviceLine ?? ""}>
            <option value="">All</option>
            {SERVICE_LINES.map((s) => <option key={s} value={s}>{SERVICE_LINE_LABELS[s]}</option>)}
          </Select>
        </div>
        {wide ? (
          <div>
            <Label htmlFor="f-as">Assignee</Label>
            <Select id="f-as" name="assigneeId" defaultValue={sp.assigneeId ?? ""}>
              <option value="">Anyone</option>
              {makers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        ) : null}
        {canSeeClients ? (
          <div>
            <Label htmlFor="f-cl">Client</Label>
            <Select id="f-cl" name="clientId" defaultValue={sp.clientId ?? ""}>
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        ) : sp.clientId ? <input type="hidden" name="clientId" value={sp.clientId} /> : null}
        <div className="flex flex-wrap items-end justify-between gap-2 sm:col-span-2 lg:col-span-6">
          <Checkbox name="closed" value="1" defaultChecked={sp.closed === "1"} label="Include filed and not applicable" />
          <div className="flex gap-2">
            <Link href={wide ? `/tasks?mine=${mine ? "1" : "0"}` : "/tasks"} className="inline-flex h-9 items-center px-3 text-sm text-muted hover:underline">Reset</Link>
            <Button type="submit" variant="secondary">Apply</Button>
          </div>
        </div>
      </form>

      <TaskList groups={groups} today={today} canBulk={canBulk} makers={makers} checkers={checkers} />
    </div>
  );
}
