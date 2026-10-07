import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { can, isReadOnlyScope, scopeOf } from "@/server/permissions/guards";
import { addDays, formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { qcOverview, engagementQc, myIndependence } from "@/server/services/qc/service";
import { listInspections, myCorrectiveActions } from "@/server/services/qc/inspections";
import { listPeerReviewPacks } from "@/server/services/qc/peer-review";
import { getSetting } from "@/server/services/settings/service";
import { db } from "@/server/lib/db";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  StartChecklistButton, CompleteChecklistButton, ChecklistItemForm, AssignEqrDialog, DeclareDialog, NewInspectionDialog, AddFindingDialog, CloseFindingDialog, CloseInspectionButton, PeerReviewForms,
} from "./qc-ui";
import { CompletenessBar } from "../documents/documents-ui";

export const metadata = { title: "Quality control" };

const SEV: Record<string, "red" | "amber" | "neutral"> = { HIGH: "red", MEDIUM: "amber", LOW: "neutral" };

export default async function QcPage({ searchParams }: { searchParams: Promise<{ engagement?: string; closed?: string }> }) {
  const actor = await requireStaff();
  const manage = can(actor, "qc.manage");
  const declare = can(actor, "qc.declare");
  if (!manage && !declare) redirect("/denied");
  const partner = manage && !isReadOnlyScope(scopeOf(actor, "qc.manage"));
  const sp = await searchParams;
  const today = todayIst();

  const [mine, myActions] = await Promise.all([declare ? myIndependence(actor) : Promise.resolve([]), myCorrectiveActions(actor)]);
  const [overview, detail, inspections, packs, sampleSize, people] = manage
    ? await Promise.all([
      load(() => qcOverview(actor, { includeClosed: sp.closed === "1" })),
      sp.engagement ? load(() => engagementQc(actor, sp.engagement!)) : Promise.resolve(null),
      listInspections(actor),
      partner ? listPeerReviewPacks(actor) : Promise.resolve([]),
      getSetting<number>("qc.inspectionSampleSize", 5),
      partner ? db().user.findMany({ where: { active: true, isSystem: false, role: { in: ["PARTNER", "MANAGER", "STAFF"] } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }) : Promise.resolve([]),
    ])
    : [[], null, [], [], 5, []] as const;
  const pending = mine.filter((m) => !m.declaration).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Quality control" subtitle="SQC 1 / SQM checklists, independence, engagement quality review, file inspections and the peer-review pack." />

      {declare ? (
        <Card id="declarations">
          <CardHeader><CardTitle>My independence declarations{pending ? ` · ${pending} pending` : ""}</CardTitle><span className="text-xs text-muted">Audit engagements you are on.</span></CardHeader>
          {mine.length === 0 ? <CardContent className="text-sm text-muted">You are not on any active audit engagement.</CardContent> : (
            <ul className="divide-y divide-line">
              {mine.map((m) => (
                <li key={m.engagementId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="min-w-0"><span className="font-mono text-xs text-muted">{m.code}</span> {m.client} <span className="text-muted">· {m.name}</span></span>
                  <span className="flex items-center gap-2">
                    {m.declaration ? (m.declaration.hasConflict ? <Badge tone="red">Threat declared</Badge> : <Badge tone="green">Declared {formatDateTime(m.declaration.declaredAt)}</Badge>) : <Badge tone="amber">Pending</Badge>}
                    <DeclareDialog engagementId={m.engagementId} label={`${m.code} · ${m.client}`} existing={m.declaration} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {myActions.length ? (
        <Card>
          <CardHeader><CardTitle>My corrective actions ({myActions.length})</CardTitle></CardHeader>
          <ul className="divide-y divide-line">
            {myActions.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0 text-sm">{f.correctiveAction || f.finding} <span className="text-xs text-muted">({f.inspection.name})</span></span>
                <span className="flex items-center gap-2">{f.dueDate ? <Badge tone={f.dueDate < today ? "red" : "neutral"}>Due {formatDate(f.dueDate)}</Badge> : null}<CloseFindingDialog findingId={f.id} /></span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {manage ? (
        <>
          {detail ? (
            <Card>
              <CardHeader>
                <CardTitle>{detail.engagement.code} · {detail.engagement.client}</CardTitle>
                <Link href="/qc" className="text-sm text-brand hover:underline">Close</Link>
              </CardHeader>
              <CardContent className="space-y-5">
                <section>
                  <h3 className="mb-1 text-sm font-semibold">Audit file</h3>
                  <div className="flex flex-wrap items-center gap-3"><CompletenessBar percent={detail.auditFile.percent} /><Link href={`/documents?engagementId=${detail.engagement.id}`} className="text-sm text-brand hover:underline">Open documents</Link></div>
                </section>
                <section>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Engagement quality review</h3>
                    {detail.eqr.required && partner ? <AssignEqrDialog engagementId={detail.engagement.id} candidates={detail.eqr.candidates.map((c) => ({ id: c.id, name: c.displayName }))} current={detail.eqr.reviewer?.id} /> : null}
                  </div>
                  <p className="text-sm">
                    {detail.eqr.required ? <>Required. Reviewer: {detail.eqr.reviewer ? <strong>{detail.eqr.reviewer.displayName}</strong> : <Badge tone="amber">not named</Badge>}. </> : "Not required for this engagement. "}
                    {detail.signoffs.length ? `Sign-offs: ${detail.signoffs.map((s) => `${s.level} by ${s.by} on ${formatDateTime(s.at)}`).join("; ")}.` : "No sign-offs yet."}
                  </p>
                </section>
                <section>
                  <h3 className="mb-1 text-sm font-semibold">Independence ({detail.team.filter((t) => t.declaration).length}/{detail.team.length})</h3>
                  <ul className="flex flex-wrap gap-2">
                    {detail.team.map((m) => (
                      <li key={m.id}><Badge tone={!m.declaration ? "amber" : m.declaration.hasConflict ? "red" : "green"} title={m.declaration?.note || undefined}>{m.displayName}: {!m.declaration ? "pending" : m.declaration.hasConflict ? "threat declared" : "declared"}</Badge></li>
                    ))}
                  </ul>
                  {detail.team.filter((m) => m.declaration?.hasConflict).map((m) => <p key={m.id} className="mt-1 text-sm text-red-700">{m.displayName}: {m.declaration!.note}</p>)}
                </section>
                <section>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">SQC 1 / SQM checklist {detail.checklist ? <Badge tone={detail.checklist.status === "COMPLETE" ? "green" : "amber"} className="ml-1">{detail.checklist.status.toLowerCase()}</Badge> : null}</h3>
                    {detail.checklist && partner ? <CompleteChecklistButton checklistId={detail.checklist.id} reopen={detail.checklist.status === "COMPLETE"} /> : null}
                  </div>
                  <p className="mb-2 text-xs text-muted">Checklist wording is the firm&apos;s seeded draft (Unverified): review it against SQC 1 / SQM before relying on it.</p>
                  {detail.checklist ? (
                    <ol className="divide-y divide-line">
                      {detail.checklist.items.map((i) => <ChecklistItemForm key={i.id} item={i} disabled={!partner || detail.checklist!.status === "COMPLETE"} />)}
                    </ol>
                  ) : partner ? <StartChecklistButton engagementId={detail.engagement.id} /> : <p className="text-sm text-muted">Not started yet.</p>}
                </section>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Audit engagements ({overview.length})</CardTitle>
              <Link href={sp.closed === "1" ? "/qc" : "/qc?closed=1"} className="text-sm text-brand hover:underline">{sp.closed === "1" ? "Active only" : "Include closed"}</Link>
            </CardHeader>
            {overview.length === 0 ? <CardContent><EmptyState title="No audit engagements in your scope" /></CardContent> : (
              <Table>
                <THead><tr><TH>Engagement</TH><TH>Checklist</TH><TH>Independence</TH><TH className="hidden md:table-cell">EQR</TH><TH className="hidden sm:table-cell">Audit file</TH></tr></THead>
                <TBody>
                  {overview.map((r) => (
                    <TR key={r.id} className={sp.engagement === r.id ? "bg-brand-50/50" : undefined}>
                      <TD><Link href={`/qc?engagement=${r.id}${sp.closed === "1" ? "&closed=1" : ""}`} className="font-medium text-brand hover:underline">{r.code}</Link><div className="text-xs text-muted">{r.client}</div></TD>
                      <TD>{r.checklist ? <Badge tone={r.checklist.status === "COMPLETE" ? "green" : "amber"}>{r.checklist.answered}/{r.checklist.total}</Badge> : <span className="text-xs text-muted">not started</span>}</TD>
                      <TD><Badge tone={r.independence.conflicts ? "red" : r.independence.declared >= r.independence.team ? "green" : "amber"}>{r.independence.declared}/{r.independence.team}</Badge></TD>
                      <TD className="hidden md:table-cell">{r.eqr.required ? (r.eqr.done ? <Badge tone="green">Done</Badge> : <Badge tone={r.eqr.reviewer ? "blue" : "amber"}>{r.eqr.reviewer ?? "No reviewer"}</Badge>) : <span className="text-xs text-muted">n/a</span>}</TD>
                      <TD className="hidden sm:table-cell">{r.auditFile}%</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card id="findings">
            <CardHeader>
              <CardTitle>File inspections</CardTitle>
              {partner ? <NewInspectionDialog defaultFrom={addDays(today, -365)} defaultTo={today} defaultSize={sampleSize} /> : null}
            </CardHeader>
            {inspections.length === 0 ? <CardContent className="text-sm text-muted">No inspections yet.</CardContent> : (
              <div className="divide-y divide-line">
                {inspections.map((i) => (
                  <div key={i.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><span className="font-medium">{i.name}</span> <span className="text-xs text-muted">closed {formatDate(i.periodFrom)} – {formatDate(i.periodTo)} · {i.inspector}</span> <Badge tone={i.status === "CLOSED" ? "neutral" : "blue"}>{i.status.toLowerCase()}</Badge></div>
                      {partner && i.status !== "CLOSED" ? (
                        <div className="flex gap-2">
                          <AddFindingDialog inspectionId={i.id} samples={i.samples.map((s) => ({ id: s.engagementId, name: `${s.code} · ${s.client}` }))} people={people.map((p) => ({ id: p.id, name: p.displayName }))} />
                          <CloseInspectionButton inspectionId={i.id} />
                        </div>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted">Sample: {i.samples.map((s) => `${s.code} (${s.client})`).join(", ") || "none"}</p>
                    {i.findings.length ? (
                      <Table>
                        <THead><tr><TH>Finding</TH><TH className="hidden sm:table-cell">Owner</TH><TH>Due</TH><TH /></tr></THead>
                        <TBody>
                          {i.findings.map((f) => (
                            <TR key={f.id}>
                              <TD><Badge tone={SEV[f.severity]}>{f.severity.toLowerCase()}</Badge> {f.engagement ? <span className="font-mono text-xs text-muted">{f.engagement}</span> : null} {f.finding}{f.correctiveAction ? <div className="text-xs text-muted">Action: {f.correctiveAction}</div> : null}</TD>
                              <TD className="hidden sm:table-cell">{f.owner || "—"}</TD>
                              <TD className="whitespace-nowrap">{f.closedAt ? <Badge tone="green">Closed</Badge> : f.dueDate ? <Badge tone={f.overdue ? "red" : "neutral"}>{formatDate(f.dueDate)}</Badge> : "—"}</TD>
                              <TD>{!f.closedAt && (partner || f.ownerId === actor.userId) ? <CloseFindingDialog findingId={f.id} /> : null}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    ) : <p className="text-sm text-muted">No findings recorded.</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {partner ? (
            <Card>
              <CardHeader><CardTitle>Peer-review pack</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <PeerReviewForms defaultFrom={addDays(today, -365)} defaultTo={today} />
                {packs.length ? (
                  <ul className="divide-y divide-line text-sm">
                    {packs.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>{formatDate(p.periodFrom)} – {formatDate(p.periodTo)} <span className="text-xs text-muted">by {p.by}, {formatDateTime(p.createdAt)}</span></span>
                        {p.documentId ? <a href={`/api/dms/${p.documentId}`} className="text-brand hover:underline">Download zip</a> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
