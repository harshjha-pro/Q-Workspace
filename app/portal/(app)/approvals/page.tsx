import { requirePortal } from "@/server/context";
import { portalApprovals } from "@/server/services/portal/actions";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalForm } from "../../_ui/forms";
import { decideApprovalAction } from "../actions";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const actor = await requirePortal();
  const rows = await portalApprovals(actor, { includeDecided: true });
  const open = rows.filter((r) => r.status === "OPEN");
  const decided = rows.filter((r) => r.status === "DECIDED");
  return (
    <div className="space-y-4">
      <PageHeader title="Approvals" subtitle="The firm asks for your OK before filing. Your answer is recorded with the date and time." />
      {open.length === 0 ? <Card className="p-4 text-sm text-muted">Nothing is waiting for your approval.</Card> : null}
      {open.map((r) => (
        <Card key={r.id}>
          <CardHeader><CardTitle>{r.title}</CardTitle><span className="text-xs text-muted">Asked {formatDateTime(r.requestedAt)}</span></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {r.forWhat ? <p className="text-muted">For {r.forWhat}</p> : null}
            {r.note ? <p className="whitespace-pre-wrap">{r.note}</p> : null}
            {r.documentId ? <p><a className="underline" href={`/api/dms/${r.documentId}`}>Open the document</a></p> : null}
            <ApprovalForm approve={decideApprovalAction.bind(null, r.id, "APPROVED")} reject={decideApprovalAction.bind(null, r.id, "REJECTED")} />
          </CardContent>
        </Card>
      ))}
      {decided.length ? (
        <Card>
          <CardHeader><CardTitle>Earlier answers</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-line text-sm">
              {decided.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{r.title}{r.decision?.comment ? <span className="text-muted"> — “{r.decision.comment}”</span> : null}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">{formatDateTime(r.decision?.decidedAt)}<Badge tone={r.decision?.decision === "APPROVED" ? "green" : "red"}>{r.decision?.decision === "APPROVED" ? "Approved" : "Not approved"}</Badge></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
