import { requirePortal } from "@/server/context";
import { portalAcceptances } from "@/server/services/portal/actions";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmButtons } from "../../_ui/forms";
import { acceptLetterAction, decideProposalAction } from "../actions";

export const metadata = { title: "Proposals & letters" };

const fee = (p: { feeBasis: string; feePaise: number; ratePaise: number }) =>
  p.feeBasis === "TIME" ? `${formatInr(p.ratePaise)} per hour` : p.feeBasis === "RETAINER" ? `${formatInr(p.feePaise)} (retainer)` : formatInr(p.feePaise);

export default async function AgreementsPage() {
  const actor = await requirePortal();
  const { proposals, letters } = await portalAcceptances(actor);
  return (
    <div className="space-y-4">
      <PageHeader title="Proposals & letters" subtitle="Accepting here is recorded with the date, time and your sign-in. Fees are plus GST as applicable." />
      {proposals.length === 0 && letters.length === 0 ? <Card className="p-4 text-sm text-muted">Nothing to accept right now.</Card> : null}
      {proposals.map((p) => (
        <Card key={p.id}>
          <CardHeader><CardTitle>Proposal: {p.title}</CardTitle>{p.status === "SENT" ? <Badge tone="amber">Waiting for you{p.validUntil ? ` · valid till ${formatDate(p.validUntil)}` : ""}</Badge> : <Badge tone={p.status === "ACCEPTED" ? "green" : "neutral"}>{p.status === "ACCEPTED" ? "Accepted" : "Declined"}</Badge>}</CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="font-medium">Fee:</span> {fee(p)}</p>
            <details><summary className="cursor-pointer">Scope, deliverables and timelines</summary>
              <div className="mt-2 space-y-2 whitespace-pre-wrap"><p>{p.scope}</p><p>{p.deliverables}</p><p>{p.timelines}</p>{p.oopTerms ? <p>{p.oopTerms}</p> : null}</div>
            </details>
            {p.status === "SENT" ? <ConfirmButtons buttons={[
              { label: "Accept proposal", action: decideProposalAction.bind(null, p.id, "ACCEPTED"), confirm: "Accept this proposal?" },
              { label: "Decline", action: decideProposalAction.bind(null, p.id, "REJECTED"), variant: "secondary", confirm: "Decline this proposal?" },
            ]} /> : null}
          </CardContent>
        </Card>
      ))}
      {letters.map((l) => (
        <Card key={l.id}>
          <CardHeader><CardTitle>Engagement letter</CardTitle>{l.status === "ISSUED" ? <Badge tone="amber">Waiting for you</Badge> : <Badge tone="green">Accepted {formatDateTime(l.acceptedAt)}</Badge>}</CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-line bg-gray-50 p-3 font-sans text-sm">{l.body}</pre>
            {l.status === "ISSUED" ? <ConfirmButtons buttons={[{ label: "I accept this engagement letter", action: acceptLetterAction.bind(null, l.id), confirm: "Accept the engagement letter on behalf of the entity?" }]} /> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
