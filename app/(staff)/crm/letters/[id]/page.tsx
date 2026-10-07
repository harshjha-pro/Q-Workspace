import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getLetter, isPlaceholderClient } from "@/server/services/crm/letters";
import { can } from "@/server/permissions/guards";
import { load, requireCap } from "@/lib/page";
import { formatDateTime, todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EditLetterDialog, AcceptLetterDialog } from "../../_ui/letter-forms";
import { ConfirmAction, ReasonAction } from "../../_ui/common";
import { updateLetterAction, issueLetterAction, withdrawLetterAction, acceptLetterAction } from "../../actions";
import { stageTemplateOptions, teamOptions } from "../../_lib/pickers";
import { LETTER_TONE, words } from "../../_lib/labels";

export const metadata = { title: "Engagement letter" };

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "crm.view");
  const { id } = await params;
  const v = await load(() => getLetter(actor, id));
  const l = v.letter;
  const manage = can(actor, "crm.manage");
  const open = l.status === "DRAFT" || l.status === "ISSUED";
  // Q-23: a letter the client accepted in the portal still needs its engagement set up here (signed copy optional).
  const portalAccepted = l.status === "ACCEPTED" && !!l.acceptedByPortalUserId;
  const acceptable = manage && (open || (portalAccepted && v.engagements.length === 0)) && v.proposal?.status === "ACCEPTED";
  const [types, team] = acceptable ? await Promise.all([stageTemplateOptions(), teamOptions()]) : [[], []];
  const who = v.client?.name ?? v.lead?.name ?? "";

  return (
    <div className="space-y-4">
      <PageHeader
        title={v.renewal ? "Renewal letter" : "Engagement letter"}
        subtitle={<>{v.lead ? <Link className="hover:underline" href={`/crm/leads/${v.lead.id}`}>{who}</Link> : v.client ? <Link className="hover:underline" href={`/clients/${v.client.id}`}>{who}</Link> : who}{v.proposal ? <> · <Link className="hover:underline" href={`/crm/proposals/${v.proposal.id}`}>proposal v{v.proposal.version}</Link></> : null} · <Badge tone={LETTER_TONE[l.status] ?? "neutral"}>{words(l.status)}</Badge></>}
        actions={
          <>
            <a href={`/api/crm/letter/${id}?format=pdf`} className={buttonVariants({ variant: "secondary", size: "sm" })}>PDF</a>
            <a href={`/api/crm/letter/${id}?format=docx`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Word</a>
            {manage && l.status === "DRAFT" ? <EditLetterDialog action={updateLetterAction.bind(null, id)} body={l.body} /> : null}
            {manage && l.status === "DRAFT" ? <ConfirmAction trigger="Mark issued" title="Mark issued" description="Records that the letter was sent to the client for signature." action={issueLetterAction.bind(null, id)} /> : null}
            {acceptable ? <AcceptLetterDialog action={acceptLetterAction.bind(null, id)} types={types} team={team} defaults={{ engagementType: v.spec!.engagementType, recurrence: v.spec!.recurrence, name: v.proposal!.title }} today={todayIst()} signedCopyOptional={portalAccepted} /> : null}
            {manage && open && !v.renewal ? <ReasonAction trigger="Withdraw" title="Withdraw letter" action={withdrawLetterAction.bind(null, id)} danger /> : null}
          </>
        }
      />
      {v.missing.length ? <Alert tone="warn">Missing values: {v.missing.join(", ")}. Fill them in (edit text) before issuing.</Alert> : null}
      {portalAccepted ? <Alert tone={v.engagements.length ? "success" : "warn"}>Accepted by the client in the portal on {formatDateTime(l.acceptedAt)}{l.acceptedIp ? ` (IP ${l.acceptedIp})` : ""}.{v.engagements.length ? " " : " Set up the engagement now; a signed copy is optional."}{v.engagements.map((e) => <Link key={e.id} className="underline" href={`/engagements/${e.id}`}>{e.code} {e.name}</Link>)}</Alert> : null}
      {l.status === "SIGNED_UPLOADED" ? (
        <Alert tone="success">
          Accepted {formatDateTime(l.acceptedAt)} (signed copy uploaded).{" "}
          {v.engagements.map((e) => <Link key={e.id} className="underline" href={`/engagements/${e.id}`}>{e.code} {e.name}</Link>)}
          {!isPlaceholderClient(l.clientId) ? <> · <Link className="underline" href={`/crm/onboarding/${l.clientId}`}>Onboarding checklist</Link></> : null}
        </Alert>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Letter text</CardTitle><span className="text-xs text-muted">{l.templateVersionId ? "Firm template" : "Built-in default text"}</span></CardHeader>
        <CardContent><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{l.body}</pre></CardContent>
      </Card>
      {l.status === "ISSUED" && !isPlaceholderClient(l.clientId) ? <p className="text-xs text-muted">The client can accept this letter in the portal; you will be notified. Or upload the signed copy.</p> : null}
    </div>
  );
}
