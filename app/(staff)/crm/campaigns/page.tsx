import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listCampaigns } from "@/server/services/crm/campaigns";
import { keyDates } from "@/server/services/crm/communications";
import { requireCap } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CampaignDialog } from "../_ui/campaign-forms";
import { createCampaignAction } from "../actions";
import { groupOptions } from "../_lib/pickers";
import { words } from "../_lib/labels";

export const metadata = { title: "Client communications" };

export default async function CampaignsPage() {
  const actor = await requireStaff();
  requireCap(actor, "campaign.manage");
  const [rows, groups, dates] = await Promise.all([listCampaigns(actor), groupOptions(), can(actor, "crm.view") ? keyDates(actor, 30) : []]);

  return (
    <div className="space-y-4">
      <PageHeader title="Client communications" subtitle="Greetings and firm updates to client segments, with opt-out respected." actions={<CampaignDialog trigger="New communication" action={createCampaignAction} groups={groups} />} />
      <Card>
        <Table>
          <THead><tr><TH>Name</TH><TH>Status</TH><TH>Sent</TH><TH>Created</TH></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={4} className="py-6 text-center text-muted">None yet.</TD></TR> : null}
            {rows.map((c) => (
              <TR key={c.id}>
                <TD><Link className="font-medium hover:underline" href={`/crm/campaigns/${c.id}`}>{c.name}</Link></TD>
                <TD><Badge tone={c.status === "DONE" ? "green" : c.status === "READY" ? "amber" : "neutral"}>{words(c.status)}</Badge></TD>
                <TD>{c.sent} of {c.total}</TD>
                <TD className="whitespace-nowrap text-sm">{formatDateTime(c.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>Key dates in the next 30 days</CardTitle><span className="text-xs text-muted">Contact birthdays and incorporation anniversaries</span></CardHeader>
        <CardContent>
          {dates.length === 0 ? <p className="text-sm text-muted">None.</p> : null}
          <ul className="divide-y divide-line text-sm">
            {dates.map((d, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span><span className="tabular-nums">{formatDate(d.date)}</span> — {d.kind === "BIRTHDAY" ? <>Birthday: {d.who}</> : <>Incorporation anniversary ({d.years} years)</>}</span>
                <Link className="text-brand hover:underline" href={`/crm/clients/${d.clientId}/communications`}>{d.clientName}</Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
