import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { timelineBoard, timelineCell, type TimelineCell, type TimelineView } from "@/server/services/analytics/timeline";
import type { DisplayState } from "@/server/compliance-engine";
import { formatDate } from "@/server/lib/dates";
import { SERVICE_LINE_LABELS, type ServiceLine } from "@/server/domain/enums";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Timeline board" };

type SP = { view?: string; start?: string; weeks?: string; line?: string; cell?: string };

/** Display states in reserved status colours, always with a text label (legend, title and drill-down). */
const STATE: Record<DisplayState, { label: string; chip: string; tone: BadgeTone }> = {
  OVERDUE: { label: "Overdue", chip: "bg-status-critical text-white", tone: "red" },
  DUE_TODAY: { label: "Due today", chip: "bg-status-serious text-ink", tone: "red" },
  AT_RISK: { label: "At risk (due in 3 days)", chip: "bg-status-warning text-ink", tone: "amber" },
  PENDING_FROM_CLIENT: { label: "Waiting on client", chip: "border-2 border-status-warning bg-white text-ink", tone: "amber" },
  ON_TRACK: { label: "On track", chip: "bg-viz-1 text-white", tone: "blue" },
  NO_DATE: { label: "No due date", chip: "bg-gray-200 text-ink", tone: "neutral" },
  FILED_LATE: { label: "Filed late", chip: "border-2 border-status-serious bg-white text-ink", tone: "neutral" },
  FILED: { label: "Filed", chip: "border-2 border-status-good bg-white text-ink", tone: "green" },
  NOT_APPLICABLE: { label: "Not applicable", chip: "bg-gray-100 text-muted", tone: "neutral" },
};
const SPAN: Record<string, string> = { OnTrack: "bg-viz-1", AtRisk: "bg-status-warning", Over: "bg-status-critical", None: "bg-gray-300" };
const VIEWS: [TimelineView, string][] = [["compliance", "By client"], ["engagement", "By engagement"], ["people", "By person"]];
const WEEKS = [4, 6, 8, 13];

export default async function TimelinePage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  if (!can(actor, "analytics.team") && !can(actor, "analytics.operational")) redirect("/denied");
  const sp = await searchParams;
  const seesPeople = can(actor, "analytics.team");
  const view = sp.view === "people" && !seesPeople ? "compliance" : sp.view;
  const opts = { view, start: sp.start, weeks: sp.weeks ? Number(sp.weeks) : undefined, serviceLine: sp.line || undefined };
  const d = await timelineBoard(actor, opts);
  const w = d.window;

  const qs = (over: Partial<Record<keyof SP, string | undefined>>) => {
    const p = new URLSearchParams();
    const all = { view: d.view, start: w.from, weeks: String(w.weeks), line: sp.line, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    return `/analytics/timeline?${p.toString()}`;
  };
  const colLabel = (i: number) => (i === 0 ? `Before ${formatDate(w.from)}` : `Week of ${formatDate(w.cols[i - 1]!.from)}`);

  // Drill-down panel for the selected cell (row id : column index).
  const [cellRow, cellCol] = (sp.cell ?? "").split(":");
  const selected = cellRow && cellCol !== undefined ? d.rows.find((r) => r.id === cellRow) : undefined;
  const drill = selected ? await timelineCell(actor, { ...opts, rowId: cellRow!, col: Number(cellCol) }) : null;

  const nowCol = w.today >= w.from && w.today <= w.to ? w.cols.findIndex((c) => w.today >= c.from && w.today <= c.to) + 1 : -1;
  const rowHead = d.view === "compliance" ? "Client" : d.view === "engagement" ? "Engagement" : "Person";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Timeline board"
        subtitle={`${formatDate(w.from)} to ${formatDate(w.to)} · ${d.scope === "firm" ? "whole firm" : "your team"}`}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <nav aria-label="View" className="flex gap-1.5">
          {VIEWS.filter(([v]) => v !== "people" || seesPeople).map(([v, l]) => (
            <Link key={v} href={qs({ view: v, cell: undefined })} aria-current={d.view === v ? "page" : undefined} className={cn("rounded-md px-2.5 py-1", d.view === v ? "bg-brand text-white" : "border border-line bg-white")}>{l}</Link>
          ))}
        </nav>
        <nav aria-label="Weeks" className="flex items-center gap-1.5">
          <Link href={qs({ start: w.prev })} className="rounded-md border border-line bg-white px-2 py-1" aria-label="Earlier weeks">←</Link>
          <Link href={qs({ start: undefined })} className="rounded-md border border-line bg-white px-2.5 py-1">This week</Link>
          <Link href={qs({ start: w.next })} className="rounded-md border border-line bg-white px-2 py-1" aria-label="Later weeks">→</Link>
          {WEEKS.map((n) => (
            <Link key={n} href={qs({ weeks: String(n) })} aria-current={w.weeks === n ? "true" : undefined} className={cn("rounded-md px-2 py-1", w.weeks === n ? "bg-brand text-white" : "border border-line bg-white")}>{n} wks</Link>
          ))}
        </nav>
        <form action="/analytics/timeline" className="flex items-center gap-1.5">
          <input type="hidden" name="view" value={d.view} />
          <input type="hidden" name="start" value={w.from} />
          <input type="hidden" name="weeks" value={w.weeks} />
          <label htmlFor="tl-line" className="text-muted">Service line</label>
          <select id="tl-line" name="line" defaultValue={sp.line ?? ""} className="rounded-md border border-line bg-white px-2 py-1">
            <option value="">All</option>
            {Object.entries(SERVICE_LINE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="rounded-md border border-line bg-white px-2.5 py-1">Apply</button>
        </form>
      </div>

      <Legend view={d.view} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-xs">
            <caption className="sr-only">Timeline {rowHead.toLowerCase()} by week. Each cell shows the number of tasks due and takes the colour of its most urgent task.</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 w-56 border-b border-line bg-surface p-2 text-left font-medium">{rowHead}</th>
                {[0, ...w.cols.map((_, i) => i + 1)].map((i) => (
                  <th key={i} scope="col" className={cn("border-b border-line p-2 text-center font-medium", i === nowCol && "bg-brand-50")}>
                    {i === 0 ? "Earlier" : formatDate(w.cols[i - 1]!.from).slice(0, 6)}
                    {i === nowCol ? <div className="text-[10px] font-normal text-muted">this week</div> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.length === 0 ? <tr><td colSpan={w.weeks + 2} className="p-3 text-sm text-muted">Nothing due in these weeks.</td></tr> : null}
              {d.rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <th scope="row" className="sticky left-0 z-10 max-w-56 border-b border-line bg-surface p-2 text-left font-normal">
                    <Link href={r.href} className="block truncate font-medium text-ink hover:underline">{r.label}</Link>
                    {r.sub ? <div className="truncate text-muted">{r.sub}</div> : null}
                  </th>
                  {r.cells.map((c, i) => {
                    const inSpan = r.span && i >= r.span.from && i <= r.span.to;
                    return (
                      <td key={i} className={cn("border-b border-line p-1 text-center align-middle", i === nowCol && "bg-brand-50/60", sp.cell === `${r.id}:${i}` && "outline-2 outline-brand")}>
                        <Cell c={c} href={c.count ? qs({ cell: `${r.id}:${i}` }) : undefined} title={`${r.label} · ${colLabel(i)}`} />
                        {inSpan ? (
                          <div
                            className={cn("mt-1 h-1", SPAN[r.span!.health], i === r.span!.from && "rounded-l-[4px]", i === r.span!.to && "rounded-r-[4px]")}
                            title={`${r.label}: ${r.span!.signal}`}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {d.rows.length ? (
              <tfoot>
                <tr>
                  <th scope="row" className="sticky left-0 bg-surface p-2 text-left font-medium">{d.view === "people" ? "Open tasks" : "All tasks"}</th>
                  {d.totals.map((t, i) => <td key={i} className="p-2 text-center tabular-nums text-muted">{d.view === "people" ? t.open || "" : t.count || ""}</td>)}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {d.totalRows > d.rows.length ? <p className="p-2 text-xs text-muted">Showing the {d.rows.length} most urgent of {d.totalRows} rows. Pick a service line to narrow the board.</p> : null}
      </Card>

      {selected && drill ? (
        <Card id="drill">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{selected.label} · {colLabel(Number(cellCol))}</CardTitle>
            <Link href={qs({ cell: undefined })} className="text-sm text-muted hover:underline">Close</Link>
          </CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Task</TH>{d.view !== "compliance" ? <TH>Client</TH> : null}<TH>Due</TH><TH>State</TH></tr></THead>
              <TBody>
                {drill.length === 0 ? <TR><TD colSpan={4} className="text-sm text-muted">No tasks.</TD></TR> : null}
                {drill.map((t) => (
                  <TR key={t.id}>
                    <TD><Link href={`/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link></TD>
                    {d.view !== "compliance" ? <TD className="text-sm">{t.client}</TD> : null}
                    <TD className="text-sm tabular-nums">{formatDate(t.due)}</TD>
                    <TD><Badge tone={STATE[t.state].tone}>{STATE[t.state].label}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      {sp.line ? <p className="text-xs text-muted">Filtered to {SERVICE_LINE_LABELS[sp.line as ServiceLine] ?? sp.line}.</p> : null}
    </div>
  );
}

function Cell({ c, href, title }: { c: TimelineCell; href?: string; title: string }) {
  const leave = c.leaveDays ? <div className="text-[10px] text-muted">Leave {c.leaveDays}d</div> : null;
  if (!c.count || !c.state) return leave ?? <span className="text-gray-300" aria-hidden>·</span>;
  const s = STATE[c.state];
  const text = `${title}: ${c.count} task${c.count === 1 ? "" : "s"}${c.open !== c.count ? ` (${c.open} open)` : ""}, most urgent ${s.label.toLowerCase()}`;
  return (
    <>
      <Link href={`${href}#drill`} title={text} aria-label={text} className={cn("inline-flex min-w-8 items-center justify-center rounded px-1.5 py-1 font-medium tabular-nums hover:opacity-85", s.chip)}>
        {c.count}
      </Link>
      {leave}
    </>
  );
}

function Legend({ view }: { view: TimelineView }) {
  const states: DisplayState[] = ["OVERDUE", "DUE_TODAY", "AT_RISK", "PENDING_FROM_CLIENT", "ON_TRACK", "FILED_LATE", "FILED"];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Legend">
      {(view === "people" ? states.slice(0, 5) : states).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5"><span className={cn("inline-block h-3 w-4 rounded-sm", STATE[s].chip)} />{STATE[s].label}</span>
      ))}
      {view === "engagement" ? (
        <>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1 w-5 rounded bg-viz-1" />Span: on budget</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1 w-5 rounded bg-status-warning" />approaching</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1 w-5 rounded bg-status-critical" />over budget</span>
        </>
      ) : null}
      <span>Numbers are tasks due; the colour is the most urgent one.{view === "people" ? " Open tasks currently assigned; leave shown in days." : ""}</span>
    </div>
  );
}
