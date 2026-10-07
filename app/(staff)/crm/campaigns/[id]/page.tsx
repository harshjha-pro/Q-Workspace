import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getCampaign } from "@/server/services/crm/campaigns";
import { load, requireCap } from "@/lib/page";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CampaignDialog } from "../../_ui/campaign-forms";
import { ConfirmAction, CopyText } from "../../_ui/common";
import { updateCampaignAction, buildRecipientsAction, markSentAction } from "../../actions";
import { groupOptions } from "../../_lib/pickers";
import { words } from "../../_lib/labels";

export const metadata = { title: "Client communication" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "campaign.manage");
  const { id } = await params;
  const v = await load(() => getCampaign(actor, id));
  const groups = await groupOptions();
  const c = v.campaign;
  const pending = v.recipients.filter((r) => !r.markedSentAt);
  const done = c.status === "DONE";

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.name}
        subtitle={<><Link className="hover:underline" href="/crm/campaigns">Client communications</Link> · <Badge tone={done ? "green" : c.status === "READY" ? "amber" : "neutral"}>{words(c.status)}</Badge> · {v.recipients.length - pending.length} of {v.recipients.length} sent</>}
        actions={
          <>
            {!done ? <CampaignDialog trigger="Edit" action={updateCampaignAction.bind(null, id)} groups={groups} d={{ name: c.name, messageText: c.messageText, segment: v.segment }} /> : null}
            {!done ? <ConfirmAction trigger={c.status === "DRAFT" ? "Build recipient list" : "Rebuild list"} variant="default" title="Build recipient list" description="Matching active clients in your scope; opted-out contacts are left out. Rows already marked sent are kept." action={buildRecipientsAction.bind(null, id)} /> : null}
            {v.recipients.length ? <a href={`/api/crm/campaign/${id}?format=csv`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Download CSV</a> : null}
            {pending.length ? <ConfirmAction trigger="Mark all as sent" title="Mark all remaining as sent" description="Confirms you have sent the message to every remaining recipient." action={markSentAction.bind(null, id, null)} /> : null}
          </>
        }
      />
      <Card>
        <CardHeader><CardTitle>Message</CardTitle></CardHeader>
        <CardContent><CopyText text={c.messageText} rows={5} /></CardContent>
      </Card>
      {c.status === "DRAFT" ? <Alert tone="info">Build the recipient list to see who will get this.</Alert> : null}
      {v.recipients.length ? (
        <Card>
          <Table>
            <THead><tr><TH>Client</TH><TH>Contact</TH><TH>Channel</TH><TH>Reach</TH><TH>Sent</TH></tr></THead>
            <TBody>
              {v.recipients.map((r) => (
                <TR key={r.id}>
                  <TD>{r.clientName}<div className="text-xs text-muted">{r.clientCode}</div></TD>
                  <TD>{r.contactName}{r.role ? <div className="text-xs text-muted">{r.role}</div> : null}{r.optedOut ? <Badge tone="red">Opted out</Badge> : null}</TD>
                  <TD>{words(r.channel)}</TD>
                  <TD className="break-all text-xs">{r.channel === "EMAIL" ? r.email : r.phone}</TD>
                  <TD className="whitespace-nowrap">{r.markedSentAt ? <span className="text-xs text-muted">{formatDateTime(r.markedSentAt)}</span> : !r.optedOut ? <ConfirmAction trigger="Mark sent" variant="ghost" title={`Sent to ${r.contactName}?`} description={r.message} action={markSentAction.bind(null, id, r.id)} /> : null}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
