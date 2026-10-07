import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listOpportunities, CROSS_SELL_RULES } from "@/server/services/crm/crosssell";
import { listRenewals } from "@/server/services/crm/renewals";
import { listOpenOnboarding } from "@/server/services/crm/onboarding";
import { canSeeFees } from "@/server/services/crm/common";
import { can } from "@/server/permissions/guards";
import { requireCap } from "@/lib/page";
import { formatDate } from "@/server/lib/dates";
import { formatInr, formatMinutes } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ConfirmAction, ReasonAction, AmountAction } from "../_ui/common";
import { runCrossSellAction, convertOpportunityAction, dismissOpportunityAction, proposeRenewalAction, approveRenewalAction, declineRenewalAction, renewalLetterAction } from "../actions";
import { RENEWAL_TONE, SERVICE_LINES, words, rupeesInput } from "../_lib/labels";

export const metadata = { title: "Opportunities & renewals" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "crm.view");
  const sp = await searchParams;
  const fees = canSeeFees(actor);
  const tab = sp.tab === "renewals" && fees ? "renewals" : "crosssell";
  const manage = can(actor, "crm.manage");
  const partner = can(actor, "proposal.approve");
  const [opps, renewals, onboarding] = await Promise.all([
    tab === "crosssell" ? listOpportunities(actor) : [],
    tab === "renewals" ? listRenewals(actor) : [],
    listOpenOnboarding(actor),
  ]);
  const line = (s: string) => SERVICE_LINES.find(([k]) => k === s)?.[1] ?? s;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Opportunities & renewals"
        subtitle="Services suggested by each client's profile, and recurring work coming up for renewal."
        actions={
          <>
            <Link href="/crm/feedback" className={buttonVariants({ variant: "secondary", size: "sm" })}>Client feedback</Link>
            {manage && tab === "crosssell" ? <ConfirmAction trigger="Refresh suggestions" title="Refresh cross-sell suggestions" description={`Runs ${CROSS_SELL_RULES.length} rules over your clients. It also runs every night.`} action={runCrossSellAction} /> : null}
          </>
        }
      />
      <div className="flex gap-1">
        <Link href="/crm/opportunities" className={buttonVariants({ size: "sm", variant: tab === "crosssell" ? "default" : "secondary" })}>Cross-sell</Link>
        {fees ? <Link href="/crm/opportunities?tab=renewals" className={buttonVariants({ size: "sm", variant: tab === "renewals" ? "default" : "secondary" })}>Renewals</Link> : null}
      </div>

      {tab === "crosssell" ? (
        <Card>
          <Table>
            <THead><tr><TH>Client</TH><TH>Suggestion</TH><TH>Service line</TH><TH /></tr></THead>
            <TBody>
              {opps.length === 0 ? <TR><TD colSpan={4} className="py-6 text-center text-muted">No open suggestions.</TD></TR> : null}
              {opps.map((o) => (
                <TR key={o.id}>
                  <TD>{o.client ? <Link className="hover:underline" href={`/clients/${o.clientId}`}>{o.client.name}</Link> : ""}</TD>
                  <TD>{o.description}</TD>
                  <TD className="text-sm">{line(o.serviceLine)}</TD>
                  <TD>
                    {manage ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <ConfirmAction trigger="Convert to lead" variant="default" title="Convert to lead" description={`${o.client?.name ?? ""}: ${o.description}`} action={convertOpportunityAction.bind(null, o.id)} />
                        <ReasonAction trigger="Dismiss" title="Dismiss suggestion" action={dismissOpportunityAction.bind(null, o.id)} />
                      </div>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Renewals due</CardTitle><span className="text-xs text-muted">Prompted 60 days before the new period. Suggestion = higher of last fee and last period&apos;s cost plus the firm&apos;s target markup.</span></CardHeader>
          <Table>
            <THead><tr><TH>Engagement</TH><TH>New period</TH><TH className="text-right">Last fee</TH><TH className="text-right">Hours</TH><TH className="text-right">Suggested</TH><TH>Status</TH><TH /></tr></THead>
            <TBody>
              {renewals.length === 0 ? <TR><TD colSpan={7} className="py-6 text-center text-muted">No renewals due.</TD></TR> : null}
              {renewals.map((r) => (
                <TR key={r.id}>
                  <TD><Link className="hover:underline" href={`/engagements/${r.engagementId}`}>{r.engagement.name}</Link><div className="text-xs text-muted">{r.engagement.client.name}</div></TD>
                  <TD className="whitespace-nowrap">{r.periodKey}<div className="text-xs text-muted">from {formatDate(r.dueDate)}</div></TD>
                  <TD className="text-right tabular-nums">{formatInr(r.lastFeePaise)}</TD>
                  <TD className="text-right">{r.lastMinutes ? formatMinutes(r.lastMinutes) : "—"}</TD>
                  <TD className="text-right tabular-nums">{formatInr(r.approvedFeePaise ?? r.suggestedFeePaise)}</TD>
                  <TD><Badge tone={RENEWAL_TONE[r.status] ?? "neutral"}>{words(r.status)}</Badge></TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-1">
                      {manage && ["DUE", "PROPOSED"].includes(r.status) ? <AmountAction trigger="Propose fee" title="Propose renewal fee" action={proposeRenewalAction.bind(null, r.id)} defaultRupees={rupeesInput(r.suggestedFeePaise)} /> : null}
                      {partner && ["DUE", "PROPOSED"].includes(r.status) ? <AmountAction trigger="Approve" variant="default" title="Approve renewal fee" description="Partner approval of the fee for the new period." action={approveRenewalAction.bind(null, r.id)} defaultRupees={rupeesInput(r.suggestedFeePaise)} /> : null}
                      {manage && r.status === "APPROVED" ? <ConfirmAction trigger="Renewal letter" variant="default" title="Generate renewal letter" action={renewalLetterAction.bind(null, r.id)} /> : null}
                      {manage && r.status !== "LETTER_ISSUED" ? <ReasonAction trigger="Close" title="Close renewal (not renewing)" action={declineRenewalAction.bind(null, r.id)} /> : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {onboarding.length ? (
        <Card>
          <CardHeader><CardTitle>Onboarding in progress</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">{onboarding.map((o) => <li key={o.clientId}><Link className="hover:underline" href={`/crm/onboarding/${o.clientId}`}>{o.name}</Link> <span className="text-muted">— {o.done} of {o.total} done</span></li>)}</ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
