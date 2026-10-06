import Link from "next/link";
import { requireStaff } from "@/server/context";
import { thisWeek } from "@/server/services/dashboard/service";
import { scopeOf } from "@/server/permissions/guards";
import { userWhere } from "@/server/permissions/scopes";
import { db } from "@/server/lib/db";
import { load, requireCap } from "@/lib/page";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addDays, formatDate, todayIst } from "@/server/lib/dates";
import { formatMinutes } from "@/server/lib/money";
import { DueDate, TaskStatusBadge } from "../tasks/task-bits";

export const metadata = { title: "This week" };

const dayName = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

type Row = { id: string; title: string; status: string; effectiveDueDate: string | null; isProvisional: boolean; holidayShifted: boolean; client: { name: string } };

function TaskLine({ t, today }: { t: Row; today: string }) {
  return (
    <li className="py-1.5">
      <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <span>{t.client.name}</span>
        <TaskStatusBadge status={t.status} />
        {t.effectiveDueDate && t.effectiveDueDate < today ? <DueDate date={t.effectiveDueDate} status={t.status} today={today} /> : null}
        {t.isProvisional ? <span className="text-st-risk">provisional</span> : null}
      </div>
    </li>
  );
}

export default async function ThisWeekPage({ searchParams }: { searchParams: Promise<{ user?: string; next?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "task.view");
  const sp = await searchParams;
  const next = sp.next === "1";
  const viewOthers = scopeOf(actor, "work.viewOthers");
  const w = await load(() => thisWeek(actor, { userId: sp.user || undefined, next }));
  // Picker lists only people the viewer may see, so a choice never lands on "no access".
  const people = viewOthers !== "none"
    ? await db().user.findMany({ where: { AND: [userWhere(actor, viewOthers), { active: true, role: { in: ["PARTNER", "MANAGER", "STAFF", "ARTICLE"] } }] }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } })
    : [];
  const today = todayIst();
  const weekMinutes = w.days.reduce((a, d) => a + d.minutes, 0);
  const isMe = w.user.id === actor.userId;
  const href = (n: boolean) => `/this-week?${new URLSearchParams({ ...(sp.user ? { user: sp.user } : {}), ...(n ? { next: "1" } : {}) }).toString()}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={isMe ? "This week" : `${w.user.displayName}'s week`}
        subtitle={`${formatDate(w.weekStart)} – ${formatDate(addDays(w.weekStart, 6))} · ${formatMinutes(weekMinutes)} logged`}
      />
      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label="Week" className="inline-flex rounded-md border border-line bg-white p-0.5 text-sm">
          {[{ n: false, label: "This week" }, { n: true, label: "Next week" }].map((o) => (
            <Link key={o.label} href={href(o.n)} aria-current={next === o.n ? "page" : undefined}
              className={cn("rounded px-3 py-1", next === o.n ? "bg-brand text-white" : "text-ink hover:bg-gray-50")}>{o.label}</Link>
          ))}
        </nav>
        {people.length ? (
          <form method="get" className="flex items-end gap-2">
            {next ? <input type="hidden" name="next" value="1" /> : null}
            <div>
              <Label htmlFor="tw-user">Person</Label>
              <Select id="tw-user" name="user" defaultValue={w.user.id} className="w-56">
                <option value={actor.userId}>Me</option>
                {people.filter((p) => p.id !== actor.userId).map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </Select>
            </div>
            <Button type="submit" variant="secondary">Show</Button>
          </form>
        ) : null}
      </div>

      {!next ? (
        <Card className={w.overdue.length ? "border-red-200" : undefined}>
          <CardHeader><CardTitle className={w.overdue.length ? "text-st-overdue" : undefined}>Overdue</CardTitle><span className="text-xs text-muted">{w.overdue.length}</span></CardHeader>
          <CardContent className="py-2">
            {w.overdue.length === 0 ? <p className="py-2 text-sm text-muted">Nothing overdue.</p> : <ul className="divide-y divide-line text-sm">{w.overdue.map((t) => <TaskLine key={t.id} t={t} today={today} />)}</ul>}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {w.days.map((d) => {
          const isToday = d.date === today;
          return (
            <section key={d.date} aria-label={dayName(d.date)} className={cn("rounded-lg border bg-white", isToday ? "border-brand" : "border-line")}>
              <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
                <h2 className={cn("text-sm font-semibold", isToday && "text-brand")}>{dayName(d.date)}{isToday ? " · today" : ""}</h2>
                {d.minutes > 0 ? <span className="text-xs text-muted">{formatMinutes(d.minutes)} logged</span> : null}
              </header>
              <div className="px-3 py-1">
                {d.tasks.length === 0 ? <p className="py-2 text-xs text-muted">Nothing due</p> : <ul className="divide-y divide-line text-sm">{d.tasks.map((t) => <TaskLine key={t.id} t={t} today={today} />)}</ul>}
              </div>
            </section>
          );
        })}
      </div>
      {isMe ? <p className="text-xs text-muted">Hours are shown as logged, for your own record. <Link href="/work/week" className="underline">Open my week of entries</Link></p> : (
        <p className="text-xs text-muted"><Link href={`/work/week?user=${w.user.id}`} className="underline">Open {w.user.displayName}&apos;s work entries</Link></p>
      )}
    </div>
  );
}
