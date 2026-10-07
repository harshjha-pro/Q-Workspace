import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getProposal } from "@/server/services/crm/proposals";
import { can } from "@/server/permissions/guards";
import { load, requireCap } from "@/lib/page";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { formatInr, formatMinutes } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EditProposalDialog, DecideProposalDialog } from "../../_ui/proposal-forms";
import { ConfirmAction } from "../../_ui/common";
import { updateProposalAction, approveProposalAction, sentProposalAction, decideProposalAction, generateLetterAction } from "../../actions";
import { FEE_BASES, LETTER_TONE, PROPOSAL_TONE, SERVICE_LINES, words } from "../../_lib/labels";

export const metadata = { title: "Proposal" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "crm.view");
  const { id } = await params;
  const v = await load(() => getProposal(actor, id));
  const p = v.proposal;
  const manage = can(actor, "crm.manage");
  const label = (list: readonly (readonly [string, string])[], val: string) => list.find(([k]) => k === val)?.[1] ?? words(val);
  const forName = v.client?.name ?? v.lead?.name ?? "";
  const openLetter = v.letters.find((l) => l.status !== "WITHDRAWN");

  return (
    <div className="space-y-4">
      <PageHeader
        title={p.title}
        subtitle={<>{v.lead ? <Link href={`/crm/leads/${v.lead.id}`} className="hover:underline">{forName}</Link> : forName} · v{p.version} · <Badge tone={PROPOSAL_TONE[p.status] ?? "neutral"}>{words(p.status)}</Badge></>}
        actions={
          <>
            <a href={`/api/crm/proposal/${id}?format=pdf`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Download PDF</a>
            {manage && ["DRAFT", "APPROVED", "SENT"].includes(p.status) ? <EditProposalDialog action={updateProposalAction.bind(null, id)} d={p} /> : null}
            {p.status === "DRAFT" && v.canApprove ? <ConfirmAction trigger="Approve" variant="default" title="Approve proposal" description={`${v.approvalNote}. Value ${formatInr(v.valuePaise)}.`} action={approveProposalAction.bind(null, id)} /> : null}
            {manage && p.status === "APPROVED" ? <ConfirmAction trigger="Mark as sent" variant="default" title="Mark as sent" description="Download the PDF and send it to the client yourself; this records that it went out and moves the lead to Proposal Sent." action={sentProposalAction.bind(null, id)} /> : null}
            {manage && p.status === "SENT" ? <DecideProposalDialog action={decideProposalAction.bind(null, id)} /> : null}
            {manage && p.status === "ACCEPTED" && !openLetter ? <ConfirmAction trigger="Generate engagement letter" variant="default" title="Generate engagement letter" description="Uses the firm's approved template for this service line (or the built-in default)." action={generateLetterAction.bind(null, id)} /> : null}
          </>
        }
      />
      {p.status === "DRAFT" && !v.canApprove ? <Alert tone="info">Awaiting approval. {v.approvalNote}</Alert> : null}
      {p.status === "SUPERSEDED" ? <Alert tone="warn">This version was replaced by a later one.</Alert> : null}
      {openLetter ? <Alert tone="success">Engagement letter: <Link className="underline" href={`/crm/letters/${openLetter.id}`}>open</Link> <Badge tone={LETTER_TONE[openLetter.status] ?? "neutral"}>{words(openLetter.status)}</Badge></Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Proposal</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            {[["Scope of work", p.scope], ["Deliverables", p.deliverables], ["Timelines", p.timelines], ["Out-of-pocket expenses", p.oopTerms]].map(([h, t]) => (
              <section key={h}><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{h}</h3><p className="mt-1 whitespace-pre-wrap">{t || "—"}</p></section>
            ))}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Fees & budget</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                {[
                  ["Service line", label(SERVICE_LINES, p.serviceLine)],
                  ["Fee basis", label(FEE_BASES, p.feeBasis)],
                  [p.feeBasis === "TIME" ? "Hourly rate" : "Fee", p.feeBasis === "TIME" ? formatInr(p.ratePaise) : formatInr(p.feePaise)],
                  ["GST", p.gstRateBp ? `${p.gstRateBp / 100}% extra` : "Applicable rate, extra"],
                  ["Budget", p.budgetMinutes ? formatMinutes(p.budgetMinutes) : "—"],
                  ["Engagement type on acceptance", `${words(v.spec.engagementType)} (${v.spec.recurrence === "RECURRING" ? "recurring" : "one-time"})`],
                  ["Valid until", formatDate(p.validUntil)],
                  ["Approved", p.approvedAt ? `${v.approverName ?? ""} · ${formatDateTime(p.approvedAt)}` : "—"],
                  ["Sent", p.sentAt ? formatDateTime(p.sentAt) : "—"],
                ].map(([k, val]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right">{val}</dd></div>)}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Versions</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {v.versions.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2">
                    {x.id === id ? <span className="font-medium">v{x.version} (this)</span> : <Link className="hover:underline" href={`/crm/proposals/${x.id}`}>v{x.version}</Link>}
                    <Badge tone={PROPOSAL_TONE[x.status] ?? "neutral"}>{words(x.status)}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
