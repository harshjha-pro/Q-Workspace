import { formatDate } from "@/server/lib/dates";
import type { Evidence } from "@/server/services/hr/appraisals";
import { SERVICE_LINE_LABELS, type ServiceLine } from "@/server/domain/enums";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const line = (l: string) => SERVICE_LINE_LABELS[l as ServiceLine] ?? (l === "INTERNAL" ? "Internal / non-client" : l);

/** Evidence panel (spec 11.8): system facts for the cycle period. Hours appear only as context. */
export function EvidencePanel({ e }: { e: Evidence }) {
  const stat = (label: string, value: string | number, note?: string) => (
    <div><dt className="text-xs text-muted">{label}</dt><dd className="text-lg font-semibold">{value}</dd>{note ? <dd className="text-xs text-muted">{note}</dd> : null}</div>
  );
  return (
    <Card>
      <CardHeader><CardTitle>Evidence from the system</CardTitle><span className="text-xs text-muted">{formatDate(e.period.from)} – {formatDate(e.period.to)} · {e.hoursContext} (context only)</span></CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stat("Filings on time", e.filings.onTime, `${e.filings.late} late (as maker)`)}
          {stat("Review points raised", e.reviewPoints.raised, `${e.reviewPoints.perTask} per task reviewed (${e.reviewPoints.tasksReviewed})`)}
          {stat("Client feedback", e.feedback.count, e.feedback.averageRating != null ? `average ${e.feedback.averageRating} / 5` : "no ratings")}
          {stat("Applause", e.applause.count)}
          {stat("CPE completed", e.cpe.text)}
        </dl>
        {e.exposure.length ? <p className="text-sm"><span className="text-muted">Service-line exposure: </span>{e.exposure.map((x) => `${line(x.serviceLine)} ${x.sharePct}%`).join(" · ")}</p> : null}
        {!e.clientNamesShown ? <p className="text-xs text-muted">Client names are shown to Partners and Managers only.</p> : null}
        {e.filings.items.length ? (
          <details className="text-sm"><summary className="cursor-pointer text-brand">Filings ({e.filings.items.length})</summary>
            <ul className="mt-1 space-y-0.5">{e.filings.items.map((f, i) => <li key={i}>{f.client} · {f.title} · {formatDate(f.filedDate)}{f.late ? " · late" : ""}</li>)}</ul>
          </details>
        ) : null}
        {e.reviewPoints.items.length ? (
          <details className="text-sm"><summary className="cursor-pointer text-brand">Review points ({e.reviewPoints.items.length})</summary>
            <ul className="mt-1 space-y-0.5">{e.reviewPoints.items.map((p, i) => <li key={i}>{p.client} · {p.task}: {p.text} ({p.status.toLowerCase()})</li>)}</ul>
          </details>
        ) : null}
        {e.feedback.items.length ? (
          <details className="text-sm"><summary className="cursor-pointer text-brand">Client feedback ({e.feedback.items.length})</summary>
            <ul className="mt-1 space-y-0.5">{e.feedback.items.map((f, i) => <li key={i}>{f.client}{f.rating != null ? ` · ${f.rating}/5` : ""}{f.comment ? ` · “${f.comment}”` : ""}</li>)}</ul>
          </details>
        ) : null}
        {e.applause.items.length ? (
          <details className="text-sm"><summary className="cursor-pointer text-brand">Applause ({e.applause.items.length})</summary>
            <ul className="mt-1 space-y-0.5">{e.applause.items.map((a, i) => <li key={i}>{a.from}: {a.message}</li>)}</ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
