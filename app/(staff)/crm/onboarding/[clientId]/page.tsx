import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getOnboarding } from "@/server/services/crm/onboarding";
import { can } from "@/server/permissions/guards";
import { load, requireCap } from "@/lib/page";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ItemDialog, AttachDialog, DecideConflictDialog } from "../../_ui/onboarding-forms";
import { ConfirmAction } from "../../_ui/common";
import { startOnboardingAction, onboardingItemAction, attachOnboardingAction, conflictCheckAction, decideConflictAction } from "../../actions";
import { words } from "../../_lib/labels";

export const metadata = { title: "Client onboarding" };

const LINKS: Record<string, (id: string) => string> = {
  MASTER_DATA: (id) => `/clients/${id}`,
  FLAGS_CONFIRMED: (id) => `/clients/${id}`,
  CREDENTIALS: (id) => `/clients/${id}/vault`,
};

export default async function OnboardingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "crm.view");
  const { clientId } = await params;
  const v = await load(() => getOnboarding(actor, clientId));
  const manage = can(actor, "crm.manage");
  const decide = can(actor, "conflictCheck.decide");
  const done = v.items.filter((i) => i.done).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Onboarding: ${v.client.name}`}
        subtitle={<><Link className="hover:underline" href={`/clients/${clientId}`}>{v.client.code}</Link> · KYC <Badge tone={v.client.kycStatus === "COMPLETE" ? "green" : v.client.kycStatus === "PARTIAL" ? "amber" : "neutral"}>{words(v.client.kycStatus)}</Badge>{v.checklist ? <> · {done} of {v.items.length} done</> : null}</>}
        actions={
          <>
            <Link href={`/crm/clients/${clientId}/communications`} className="text-sm text-brand hover:underline">Contacts & communication</Link>
            {manage && !v.checklist ? <ConfirmAction trigger="Start onboarding" variant="default" title="Start onboarding checklist" description="KYC, master data, flags, conflict check, portal and credentials (plus previous-auditor NOC for audit clients)." action={startOnboardingAction.bind(null, clientId)} /> : null}
            {manage ? <ConfirmAction trigger="Run conflict check" title="Run conflict & independence check" description="Compares this client with other clients and groups (PAN, name, group, shared directors). Partners are notified to decide." action={conflictCheckAction.bind(null, clientId)} /> : null}
          </>
        }
      />
      {v.checklist?.completedAt ? <Alert tone="success">Onboarding completed {formatDateTime(v.checklist.completedAt)}.</Alert> : null}
      {v.lead?.gstin ? <Alert tone="info">GSTIN given at enquiry: <span className="font-mono">{v.lead.gstin}</span> — add it on the client record with its filing frequency (master data).</Alert> : null}

      {!v.checklist ? <EmptyState title="No onboarding checklist yet">{manage ? "Start one with the button above." : "Ask the client's Manager to start it."}</EmptyState> : (
        <Card>
          <CardHeader><CardTitle>Checklist</CardTitle></CardHeader>
          <ul className="divide-y divide-line">
            {v.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span aria-hidden className={i.done ? "text-green-700" : "text-muted"}>{i.done ? "✔" : "○"}</span>
                    <span className={i.done ? "" : "font-medium"}>{i.label}</span>
                  </div>
                  <div className="ml-6 text-xs text-muted">
                    {i.done && i.doneAt ? <>Done {formatDateTime(i.doneAt)}{i.doneById ? ` by ${v.people.get(i.doneById) ?? ""}` : ""}. </> : null}
                    {i.note ? <>{i.note} </> : null}
                    {i.documentId ? <a className="text-brand hover:underline" href={`/api/files/${i.documentId}`}>{v.docs.get(i.documentId) ?? "Attachment"}</a> : null}
                    {LINKS[i.code] ? <> <Link className="text-brand hover:underline" href={LINKS[i.code]!(clientId)}>Open</Link></> : null}
                  </div>
                </div>
                {manage ? (
                  <div className="flex gap-1">
                    {i.code !== "CONFLICT_CHECK" ? <ItemDialog action={onboardingItemAction.bind(null, i.id, clientId)} label={i.label} done={i.done} note={i.note} /> : null}
                    {i.code.startsWith("KYC") || i.code === "PREV_AUDITOR_NOC" || i.code === "MASTER_DATA" ? <AttachDialog action={attachOnboardingAction.bind(null, i.id, clientId)} label={i.label} /> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Conflict & independence checks</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {v.checks.length === 0 ? <p className="text-muted">No check recorded yet.</p> : null}
          {v.checks.map((c) => (
            <div key={c.id} className="rounded-md border border-line p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">{formatDateTime(c.createdAt)} · by {v.people.get(c.checkedById) ?? "system"}</span>
                {c.partnerDecision ? (
                  <span className="text-xs"><Badge tone={c.partnerDecision === "DECLINED" ? "red" : "green"}>{words(c.partnerDecision)}</Badge> {c.decidedById ? v.people.get(c.decidedById) : ""}</span>
                ) : decide ? <DecideConflictDialog action={decideConflictAction.bind(null, c.id, `/crm/onboarding/${clientId}`)} /> : <Badge tone="amber">Awaiting Partner</Badge>}
              </div>
              <pre className="mt-1 whitespace-pre-wrap font-sans">{c.matchesText}</pre>
              {c.notes ? <p className="text-xs text-muted">{c.notes}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
