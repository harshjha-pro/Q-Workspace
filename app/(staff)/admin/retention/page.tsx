import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { listPurgeRequests, listRetentionRules } from "@/server/services/lifecycle/retention";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DecideDialogs, RequestPurgeButton, RuleDialog } from "./retention-ui";

export const metadata = { title: "Retention & purge" };

const REQ_TONE = { PENDING: "amber", APPROVED: "blue", REJECTED: "neutral", EXECUTED: "green" } as const;

/** Retention rules and purge approvals (spec 7.2, 14.4; P3-07, Q-19). */
export default async function RetentionPage() {
  const actor = await requireStaff();
  requireCap(actor, "settings.manage");
  const [rules, requests] = await Promise.all([load(() => listRetentionRules(actor)), load(() => listPurgeRequests(actor))]);
  const isPartner = actor.role === "PARTNER";
  const unset = rules.filter((r) => !r.retainYears && r.recordType !== "AUDIT_LOG").length;
  const label = (t: string) => rules.find((r) => r.recordType === t)?.label ?? t;
  return (
    <div className="space-y-4">
      <PageHeader title="Retention & purge" subtitle="How long each kind of record is kept. Nothing is ever purged without a Partner's approval, and the audit trail is never purged." />
      {unset ? <Alert tone="warn">{unset} record type(s) have no retention period yet (TODO verify). Purge stays disabled for them until a Partner sets one.</Alert> : null}
      <Card>
        <CardHeader><CardTitle>Rules</CardTitle>{!isPartner ? <span className="text-xs text-muted">Only a Partner sets periods.</span> : null}</CardHeader>
        <Table>
          <THead><tr><TH>Record type</TH><TH>Period</TH><TH>Basis / source</TH><TH>Purge</TH><TH /></tr></THead>
          <TBody>
            {rules.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.label}<div className="font-mono text-xs text-muted">{r.recordType}</div></TD>
                <TD className="whitespace-nowrap">{r.retainYears ? `${r.retainYears} years` : r.recordType === "AUDIT_LOG" ? "For ever" : <Badge tone="amber">Not set</Badge>}</TD>
                <TD className="text-xs">
                  <div>{r.basis}</div>
                  <div className="text-muted">{r.source}{r.verifiedAt ? ` · verified by ${r.verifiedByName} ${formatDateTime(r.verifiedAt)}` : " · unverified"}</div>
                  {r.notYet ? <div className="mt-1 text-muted">Not purgeable yet: {r.notYet}</div> : null}
                </TD>
                <TD>{r.purgeEnabled ? <Badge tone="red">Enabled</Badge> : <Badge>Disabled</Badge>}</TD>
                <TD>
                  <span className="flex flex-wrap gap-2">
                    {isPartner && r.recordType !== "AUDIT_LOG" ? <RuleDialog recordType={r.recordType} label={r.label} purgeable={r.purgeable} v={{ retainYears: r.retainYears, basis: r.basis, source: r.source, purgeEnabled: r.purgeEnabled }} /> : null}
                    {r.purgeEnabled && r.retainYears ? <RequestPurgeButton recordType={r.recordType} /> : null}
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>Purge requests</CardTitle><span className="text-xs text-muted">The nightly job proposes purges for enabled rules; a Partner approves each one.</span></CardHeader>
        <Table>
          <THead><tr><TH>Record type</TH><TH>Records</TH><TH>Requested</TH><TH>Status</TH><TH /></tr></THead>
          <TBody>
            {requests.length === 0 ? <TR><TD colSpan={5} className="text-muted">No purge requests.</TD></TR> : null}
            {requests.map((q) => (
              <TR key={q.id}>
                <TD>{label(q.recordType)}</TD>
                <TD>{q.count}</TD>
                <TD className="text-xs">{q.requestedByName}, {formatDateTime(q.createdAt)}</TD>
                <TD><Badge tone={REQ_TONE[q.status as keyof typeof REQ_TONE] ?? "neutral"}>{q.status.toLowerCase()}</Badge>{q.approvedByName ? <div className="text-xs text-muted">{q.approvedByName}, {formatDateTime(q.decidedAt)}</div> : null}</TD>
                <TD>{isPartner && q.status === "PENDING" ? <DecideDialogs id={q.id} count={q.count} label={label(q.recordType)} /> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
