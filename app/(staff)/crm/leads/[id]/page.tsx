import { Comments } from "@/components/comments/comments";
import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getLead } from "@/server/services/crm/leads";
import { listServiceTemplates } from "@/server/services/crm/templates";
import { can } from "@/server/permissions/guards";
import { db } from "@/server/lib/db";
import { load, requireCap } from "@/lib/page";
import { formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { formatInr, formatMinutes } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LeadDialog, StageDialog, ActivityDialog } from "../../_ui/lead-forms";
import { NewProposalDialog } from "../../_ui/proposal-forms";
import { DecideConflictDialog } from "../../_ui/onboarding-forms";
import { ConfirmAction } from "../../_ui/common";
import { updateLeadAction, setStageAction, addLeadActivityAction, createProposalAction, leadConflictCheckAction, decideConflictAction } from "../../actions";
import { clientOptions, ownerOptions } from "../../_lib/pickers";
import { ACTIVITY_KINDS, PROPOSAL_TONE, LETTER_TONE, SERVICE_LINES, SOURCES, STAGES, STAGE_TONE, words } from "../../_lib/labels";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "crm.view");
  const { id } = await params;
  const v = await load(() => getLead(actor, id));
  const { lead } = v;
  const manage = can(actor, "crm.manage");
  const closed = lead.stage === "WON" || lead.stage === "LOST";
  const [owners, clients, templates, checks] = await Promise.all([
    manage ? ownerOptions() : [],
    manage ? clientOptions(actor, "crm.view") : [],
    manage && v.canSeeFees ? listServiceTemplates(actor) : [],
    db().conflictCheck.findMany({ where: { leadId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const label = (list: readonly (readonly [string, string])[], val: string) => list.find(([k]) => k === val)?.[1] ?? words(val);
  const services = lead.servicesCsv.split(",").filter(Boolean).map((s) => label(SERVICE_LINES, s));
  const today = todayIst();

  return (
    <div className="space-y-4">
      <PageHeader
        title={lead.name}
        subtitle={<><Link href="/crm/leads" className="hover:underline">Leads</Link> · <Badge tone={STAGE_TONE[lead.stage] ?? "neutral"}>{label(STAGES, lead.stage)}</Badge>{lead.lostReason ? <span className="ml-1 text-xs">— {lead.lostReason}</span> : null}</>}
        actions={
          <>
            {!closed ? <ActivityDialog action={addLeadActivityAction.bind(null, id)} today={today} /> : null}
            {manage && lead.stage !== "WON" ? <StageDialog action={setStageAction.bind(null, id)} current={lead.stage} /> : null}
            {manage && lead.stage !== "WON" ? <LeadDialog trigger="Edit" title="Edit lead" action={updateLeadAction.bind(null, id)} owners={owners} clients={clients} showFee={v.canSeeFees} defaults={lead} /> : null}
          </>
        }
      />

      {v.duplicates.length ? (
        <Alert tone="warn">
          <p className="font-medium">Possible duplicates</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {v.duplicates.map((d) => (
              <li key={`${d.kind}${d.id}`}>
                {d.visible ? <Link className="underline" href={d.kind === "LEAD" ? `/crm/leads/${d.id}` : `/clients/${d.id}`}>{d.label}</Link> : d.label} — matches on {d.matchedOn.join(", ")}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {v.client ? <Alert tone={lead.stage === "WON" ? "success" : "info"}>Client: <Link className="underline" href={`/clients/${v.client.id}`}>{v.client.name} ({v.client.code})</Link>{lead.stage === "WON" ? <> · <Link className="underline" href={`/crm/onboarding/${v.client.id}`}>Onboarding</Link></> : null}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              {[
                ["Entity type", words(lead.entityType)],
                ["Contact", lead.contactName || "—"],
                ["Email", lead.email ?? "—"],
                ["Phone", lead.phone ?? "—"],
                ["PAN", lead.pan ?? "—"],
                ["GSTIN", lead.gstin ?? "—"],
                ["Services wanted", services.join(", ") || "—"],
                ...(v.canSeeFees ? [["Estimated fee", lead.estFeePaise ? formatInr(lead.estFeePaise) : "—"]] : []),
                ["Source", `${label(SOURCES, lead.source)}${v.referrer ? ` — ${v.referrer.name}` : lead.referrerName ? ` — ${lead.referrerName}` : ""}`],
                ["Owner", lead.ownerId ? (v.names.get(lead.ownerId) ?? "") : "—"],
                ["Next follow-up", lead.nextFollowUp ? formatDate(lead.nextFollowUp) : "—"],
                ["Created", formatDateTime(lead.createdAt)],
              ].map(([k, val]) => (
                <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="break-words">{val}</dd></div>
              ))}
            </dl>
            {lead.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{lead.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Business-development hours</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="text-lg font-semibold">{v.hours.totalMinutes ? `${formatMinutes(v.hours.totalMinutes)} logged` : "None logged"}</p>
            <ul className="mt-2 space-y-1">{v.hours.byPerson.map((p) => <li key={p.userId} className="flex justify-between gap-2"><span>{p.name}</span><span className="text-muted">{formatMinutes(p.minutes)}</span></li>)}</ul>
            <p className="mt-2 text-xs text-muted">From work entries under Business Development linked to this lead.</p>
          </CardContent>
        </Card>
      </div>

      {v.canSeeFees ? (
        <Card>
          <CardHeader>
            <CardTitle>Proposals & engagement letters</CardTitle>
            {manage && !closed ? <NewProposalDialog action={createProposalAction} templates={templates.map((t) => ({ id: t.id, name: t.name, line: t.serviceLine }))} leadId={id} /> : null}
          </CardHeader>
          <Table>
            <THead><tr><TH>Proposal</TH><TH>Version</TH><TH>Status</TH><TH className="text-right">Fee</TH><TH>Valid until</TH></tr></THead>
            <TBody>
              {v.proposals.length === 0 ? <TR><TD colSpan={5} className="py-4 text-center text-muted">No proposals yet.</TD></TR> : null}
              {v.proposals.map((p) => (
                <TR key={p.id}>
                  <TD><Link className="hover:underline" href={`/crm/proposals/${p.id}`}>{p.title}</Link></TD>
                  <TD>v{p.version}</TD>
                  <TD><Badge tone={PROPOSAL_TONE[p.status] ?? "neutral"}>{words(p.status)}</Badge></TD>
                  <TD className="text-right tabular-nums">{p.feeBasis === "TIME" ? `${formatInr(p.ratePaise)}/hr` : formatInr(p.feePaise)}</TD>
                  <TD className="whitespace-nowrap">{formatDate(p.validUntil)}</TD>
                </TR>
              ))}
              {v.letters.map((l) => (
                <TR key={l.id}>
                  <TD colSpan={2}><Link className="hover:underline" href={`/crm/letters/${l.id}`}>Engagement letter</Link></TD>
                  <TD colSpan={3}><Badge tone={LETTER_TONE[l.status] ?? "neutral"}>{words(l.status)}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!closed ? <CardContent className="text-xs text-muted">Flow: proposal → Partner approval → mark sent → client accepts → generate engagement letter → upload the signed copy (creates the client and engagement, and marks the lead Won).</CardContent> : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Conflict & independence check</CardTitle>
          {manage && !closed ? <ConfirmAction trigger="Run check" title="Run conflict check" description="Compares this lead with existing clients and groups (PAN, name, group). Partners are notified to decide." action={leadConflictCheckAction.bind(null, id)} /> : null}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {checks.length === 0 ? <p className="text-muted">Not run yet. It also runs automatically when a new client is created on acceptance.</p> : null}
          {checks.map((c) => (
            <div key={c.id} className="rounded-md border border-line p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">{formatDateTime(c.createdAt)}</span>
                {c.partnerDecision ? <Badge tone={c.partnerDecision === "DECLINED" ? "red" : "green"}>{words(c.partnerDecision)}</Badge> : can(actor, "conflictCheck.decide") ? <DecideConflictDialog action={decideConflictAction.bind(null, c.id, `/crm/leads/${id}`)} /> : <Badge tone="amber">Awaiting Partner</Badge>}
              </div>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{c.matchesText}</pre>
              {c.notes ? <p className="text-xs text-muted">{c.notes}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
        <CardContent>
          {lead.activities.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : null}
          <ol className="space-y-3">
            {lead.activities.map((a) => (
              <li key={a.id} className="border-l-2 border-line pl-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge>{label(ACTIVITY_KINDS, a.kind)}</Badge><span className="text-xs text-muted">{formatDate(a.date)} · {v.names.get(a.byUserId) ?? ""}</span></div>
                <p className="mt-1 whitespace-pre-wrap">{a.notes}</p>
                {a.nextFollowUp ? <p className="text-xs text-muted">Next follow-up {formatDate(a.nextFollowUp)}</p> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Comments entityType="LEAD" entityId={id} />
    </div>
  );
}
