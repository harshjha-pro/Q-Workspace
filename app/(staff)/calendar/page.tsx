import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { can, scopeOf } from "@/server/permissions/guards";
import { calendarItems, type CalendarItem } from "@/server/services/calendar/service";
import { listClients } from "@/server/services/clients/service";
import { addDays, dayOfWeek, formatDate, isoFromParts, monthLabel, parseIso, todayIst, weekStart } from "@/server/lib/dates";
import { PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClientFilter } from "./client-filter";
import { itemLabel, itemTone, LEGEND } from "./item-style";

export const metadata = { title: "Calendar" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type DayItem = CalendarItem & { key: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; layer?: string; client?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "task.view");
  const sp = await searchParams;
  const today = todayIst();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  // The firm-wide compliance layer is for people who look after others (Partner, Manager, Practice Admin).
  const canCompliance = scopeOf(actor, "work.viewOthers") !== "none";
  const layer = canCompliance && sp.layer === "compliance" ? "compliance" : "mine";
  const clientId = sp.client || undefined;

  const { y, m } = parseIso(`${month}-01`);
  const first = `${month}-01`;
  const last = addDays(isoFromParts(y, m + 1, 1), -1);
  const gridStart = weekStart(first);
  const gridEnd = addDays(weekStart(last), 6);
  const prev = isoFromParts(y, m - 1, 1).slice(0, 7);
  const next = isoFromParts(y, m + 1, 1).slice(0, 7);

  const [items, clients] = await Promise.all([
    load(() => calendarItems(actor, { from: gridStart, to: gridEnd, layer, clientId })),
    can(actor, "client.view") ? load(() => listClients(actor, { take: 500 })) : Promise.resolve([]),
  ]);

  // Spread multi-day items (leave) over each day they cover within the grid.
  const byDay = new Map<string, DayItem[]>();
  const holidays = new Map<string, string>();
  items.forEach((it, i) => {
    if (it.kind === "HOLIDAY") holidays.set(it.date, holidays.has(it.date) ? `${holidays.get(it.date)}, ${it.title}` : it.title);
    let d = it.date < gridStart ? gridStart : it.date;
    const end = it.endDate && it.endDate < gridEnd ? it.endDate : it.endDate ? gridEnd : it.date;
    for (; d <= end; d = addDays(d, 1)) {
      const list = byDay.get(d) ?? [];
      list.push({ ...it, key: `${i}-${d}` });
      byDay.set(d, list);
    }
  });

  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const href = (o: { month?: string; layer?: string }) => {
    const q = new URLSearchParams();
    q.set("month", o.month ?? month);
    const l = o.layer ?? layer;
    if (l !== "mine") q.set("layer", l);
    if (clientId) q.set("client", clientId);
    return `/calendar?${q.toString()}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Calendar" subtitle={layer === "mine" ? "Your tasks, notice replies, hearings and leave." : "Every compliance task in your scope, with your team's leave."}
        actions={<a href="/api/calendar/ics" download className={buttonVariants({ variant: "secondary", size: "sm" })}><Download className="h-4 w-4" />Download .ics</a>} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link aria-label="Previous month" href={href({ month: prev })} className={buttonVariants({ variant: "secondary", size: "icon" })}><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-28 text-center text-sm font-semibold">{monthLabel(month)}</span>
          <Link aria-label="Next month" href={href({ month: next })} className={buttonVariants({ variant: "secondary", size: "icon" })}><ChevronRight className="h-4 w-4" /></Link>
          {month !== today.slice(0, 7) ? <Link href={href({ month: today.slice(0, 7) })} className={buttonVariants({ variant: "ghost", size: "sm" })}>Today</Link> : null}
        </div>
        {canCompliance ? (
          <div className="inline-flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label="Layer">
            {(["mine", "compliance"] as const).map((l) => (
              <Link key={l} href={href({ layer: l })} aria-current={layer === l ? "page" : undefined}
                className={cn("px-3 py-1.5", layer === l ? "bg-brand text-white" : "bg-white hover:bg-gray-50")}>
                {l === "mine" ? "Mine" : "Compliance"}
              </Link>
            ))}
          </div>
        ) : null}
        {clients.length ? <div className="w-full sm:ml-auto sm:w-auto"><ClientFilter clients={clients.map((c) => ({ id: c.id, name: c.name }))} value={clientId ?? ""} /></div> : null}
      </div>

      {/* Grid (≥640px) */}
      <div className="hidden overflow-hidden rounded-lg border border-line bg-white sm:block">
        <div className="grid grid-cols-7 border-b border-line bg-gray-50 text-center text-xs font-medium text-muted">
          {WEEKDAYS.map((w) => <div key={w} className="py-1.5">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = (byDay.get(d) ?? []).filter((i) => i.kind !== "HOLIDAY");
            const inMonth = d.startsWith(month);
            const holiday = holidays.get(d);
            const weekend = dayOfWeek(d) === 0;
            return (
              <div key={d} className={cn("min-h-28 border-b border-r border-line p-1 text-xs [&:nth-child(7n)]:border-r-0", !inMonth && "bg-gray-50/60 text-muted", (holiday || weekend) && inMonth && "bg-gray-100")}>
                <div className="flex items-start justify-between gap-1">
                  <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-medium", d === today && "bg-brand text-white")}>{parseIso(d).d}</span>
                  {holiday ? <span className="truncate text-[10px] text-muted" title={holiday}>{holiday}</span> : null}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {list.slice(0, 4).map((it) => <li key={it.key}><Chip item={it} today={today} /></li>)}
                </ul>
                {list.length > 4 ? (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-[11px] text-brand">+{list.length - 4} more</summary>
                    <ul className="mt-0.5 space-y-0.5">{list.slice(4).map((it) => <li key={it.key}><Chip item={it} today={today} /></li>)}</ul>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda (<640px) */}
      <div className="space-y-2 sm:hidden">
        {days.filter((d) => d.startsWith(month) && byDay.has(d)).map((d) => (
          <section key={d} className={cn("rounded-lg border border-line bg-white p-3", holidays.has(d) && "bg-gray-100")}>
            <h2 className={cn("text-sm font-semibold", d === today && "text-brand")}>
              {WEEKDAYS[(dayOfWeek(d) + 6) % 7]}, {formatDate(d)}{d === today ? " · Today" : ""}
            </h2>
            {holidays.has(d) ? <p className="text-xs text-muted">Holiday: {holidays.get(d)}</p> : null}
            <ul className="mt-2 space-y-1.5">
              {byDay.get(d)!.filter((i) => i.kind !== "HOLIDAY").map((it) => <li key={it.key}><Chip item={it} today={today} wide /></li>)}
            </ul>
          </section>
        ))}
        {![...byDay.keys()].some((d) => d.startsWith(month)) ? <p className="rounded-lg border border-dashed border-line bg-white p-6 text-center text-sm text-muted">Nothing this month.</p> : null}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        {LEGEND.map((l) => <li key={l.label} className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-sm", l.className)} />{l.label}</li>)}
        <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-line bg-gray-100" />Holiday / Sunday</li>
      </ul>
    </div>
  );
}

function Chip({ item, today, wide }: { item: CalendarItem; today: string; wide?: boolean }) {
  const label = itemLabel(item, today);
  const text = (
    <>
      <span className={cn("block font-medium", !wide && "truncate")}>{item.title}</span>
      {item.sub ? <span className={cn("block text-muted", !wide && "truncate")}>{item.sub}</span> : null}
      {wide ? <span className="block text-[11px] text-muted">{label}{item.endDate ? ` · until ${formatDate(item.endDate)}` : ""}</span> : null}
    </>
  );
  const cls = cn("block rounded border-l-4 bg-white px-1.5 py-0.5 leading-tight shadow-sm ring-1 ring-line", itemTone(item, today), wide ? "text-sm" : "text-[11px]");
  const title = `${item.title}${item.sub ? ` — ${item.sub}` : ""} (${label})`;
  return item.link ? <Link href={item.link} className={cn(cls, "hover:bg-gray-50")} title={title}>{text}</Link> : <span className={cls} title={title}>{text}</span>;
}
