import { formatDate, todayIst } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import type { getArticleship } from "@/server/services/hr/articleship";
import { NOTE_LABELS } from "@/server/services/hr/articleship";
import { SERVICE_LINE_LABELS, type ServiceLine } from "@/server/domain/enums";
import { Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NoteDialog, RecordDialog } from "./ui";

type Detail = Awaited<ReturnType<typeof getArticleship>>;
const half = (h: number) => `${h / 2} day${h === 2 ? "" : "s"}`;
const lineLabel = (l: string) => SERVICE_LINE_LABELS[l as ServiceLine] ?? (l === "INTERNAL" ? "Internal / non-client" : l);

/** Articleship detail shared by /hr/articleship/[userId] and /me/articleship. */
export function ArticleshipDetail({ d, partners }: { d: Detail; partners: { id: string; name: string }[] }) {
  const r = d.record;
  const s = d.summary;
  const kinds = Object.entries(NOTE_LABELS).filter(([k]) => (d.canNote ? true : d.canClassNote && (k === "CLASS" || k === "EXAM")));
  return (
    <div className="space-y-4">
      {s.completionApproaching ? <Alert tone="warn">Completes in {Math.max(0, s.daysToCompletion)} days ({formatDate(s.revisedEndDate)}). Plan the replacement.</Alert> : null}
      {s.excessLeave ? <Alert tone="error">Leave taken exceeds the entitlement by {half(s.excessHalfDays)}.{d.rules.extendByExcessLeave ? ` Completion moves by ${s.excessDays} day${s.excessDays === 1 ? "" : "s"}.` : ""}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Registration</CardTitle>
          <span className="flex items-center gap-2"><Badge tone={r.status === "ACTIVE" ? "blue" : "neutral"}>{r.status.toLowerCase()}</Badge>{d.canEdit ? <RecordDialog userId={r.userId} partners={partners} current={r} trigger="Edit" /> : null}</span>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted">Institute</dt><dd>{r.institute}</dd></div>
            <div><dt className="text-xs text-muted">Registration no.</dt><dd>{r.registrationNo}</dd></div>
            <div><dt className="text-xs text-muted">Principal</dt><dd>{d.principal}</dd></div>
            <div><dt className="text-xs text-muted">Started</dt><dd>{formatDate(r.startDate)}</dd></div>
            <div><dt className="text-xs text-muted">Expected completion</dt><dd>{formatDate(r.expectedEndDate)}</dd></div>
            <div><dt className="text-xs text-muted">Revised completion</dt><dd className={s.revisedEndDate !== r.expectedEndDate ? "font-semibold text-red-700" : ""}>{formatDate(s.revisedEndDate)}</dd></div>
            <div><dt className="text-xs text-muted">Leave entitled</dt><dd>{half(s.entitledHalfDays)}</dd></div>
            <div><dt className="text-xs text-muted">Leave taken</dt><dd>{half(s.takenHalfDays)}</dd></div>
          </dl>
          {r.completionDate || r.terminationDate ? <p className="mt-3 text-sm text-muted">{r.completionDate ? `Completed ${formatDate(r.completionDate)}` : `Ended ${formatDate(r.terminationDate)}`}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Exposure by service line</CardTitle><span className="text-xs text-muted">{Math.round(d.exposure.totalMinutes / 60)} hrs logged since joining</span></CardHeader>
        <CardContent>
          {d.exposure.lines.length === 0 ? <p className="text-sm text-muted">No work entries yet.</p> : (
            <ul className="space-y-2">
              {d.exposure.lines.map((l) => (
                <li key={l.serviceLine} className="text-sm">
                  <div className="flex justify-between"><span>{lineLabel(l.serviceLine)}</span><span className="text-muted">{l.sharePct}%</span></div>
                  <div className="mt-1 h-2 rounded bg-gray-100" aria-hidden><div className="h-2 rounded bg-brand" style={{ width: `${l.sharePct}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Share of logged effort, built from work entries. It shows breadth of exposure, not performance.</p>
        </CardContent>
      </Card>

      {d.stipend ? (
        <Card>
          <CardHeader><CardTitle>Stipend (Partner / HR only)</CardTitle><span className="text-xs text-muted">Year {d.stipend.stipendYear}</span></CardHeader>
          <CardContent className="text-sm">
            {d.stipend.minimums.length === 0 ? <p className="text-muted">No stipend minimum configured for {r.institute} year {d.stipend.stipendYear}.</p> : (
              <ul className="space-y-1">
                {d.stipend.minimums.map((m) => (
                  <li key={m.locationClass}>Minimum ({m.locationClass}): {formatInr(m.amountPaise)} / month {m.verified ? null : <Badge tone="amber">Unverified</Badge>}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">The stipend actually paid is on the payroll stipend structure (HR → Payroll).</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Study / exam leave</CardTitle></CardHeader>
        <CardContent>
          {d.studyLeave.length === 0 ? <p className="text-sm text-muted">None.</p> : (
            <ul className="divide-y divide-line text-sm">
              {d.studyLeave.map((l) => <li key={l.id} className="flex justify-between py-1.5"><span>{formatDate(l.fromDate)} – {formatDate(l.toDate)} · {half(l.halfDays)}</span><Badge>{l.status.toLowerCase()}</Badge></li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notes, feedback, classes and exams</CardTitle>{kinds.length ? <NoteDialog recordId={r.id} userId={r.userId} kinds={kinds} today={todayIst()} /> : null}</CardHeader>
        <CardContent>
          {d.notes.length === 0 ? <p className="text-sm text-muted">No notes yet.</p> : (
            <ul className="divide-y divide-line">
              {d.notes.map((n) => (
                <li key={n.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><Badge tone={n.kind === "FEEDBACK" || n.kind === "PRINCIPAL_NOTE" ? "violet" : "neutral"}>{NOTE_LABELS[n.kind as keyof typeof NOTE_LABELS] ?? n.kind}</Badge>{formatDate(n.date)} · {n.author}</div>
                  <p className="mt-1 whitespace-pre-line">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
