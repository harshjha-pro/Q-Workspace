import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getClientCommunications, keyDates } from "@/server/services/crm/communications";
import { can } from "@/server/permissions/guards";
import { load, requireCap } from "@/lib/page";
import { formatDate, todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LogCommunicationDialog, CategoryDialog } from "../../../_ui/comm-forms";
import { ConfirmAction } from "../../../_ui/common";
import { logCommunicationAction, optOutAction, categoryAction } from "../../../actions";
import { ACTIVITY_KINDS, words } from "../../../_lib/labels";

export const metadata = { title: "Client communication" };

export default async function CommunicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "crm.view");
  const { id } = await params;
  const v = await load(() => getClientCommunications(actor, id));
  const manage = can(actor, "crm.manage");
  const today = todayIst();
  const dates = (await keyDates(actor, 30, today)).filter((d) => d.clientId === id);
  const kind = (k: string) => ACTIVITY_KINDS.find(([x]) => x === k)?.[1] ?? k;

  return (
    <div className="space-y-4">
      <PageHeader
        title={v.client.name}
        subtitle={<><Link className="hover:underline" href={`/clients/${id}`}>{v.client.code}</Link> · Category {v.client.category ?? "—"}{v.client.tags ? <> · {v.client.tags}</> : null}</>}
        actions={
          <>
            <LogCommunicationDialog action={logCommunicationAction.bind(null, id)} today={today} engagements={v.engagements.map((e) => ({ id: e.id, name: `${e.code} ${e.name}` }))} />
            {manage ? <CategoryDialog action={categoryAction.bind(null, id)} category={v.client.category} tags={v.client.tags} /> : null}
            {manage ? <Link href={`/crm/onboarding/${id}`} className="self-center text-sm text-brand hover:underline">Onboarding</Link> : null}
          </>
        }
      />
      <Card>
        <CardHeader><CardTitle>Contacts</CardTitle><Link className="text-xs text-brand hover:underline" href={`/clients/${id}`}>Add / edit on the client page</Link></CardHeader>
        <Table>
          <THead><tr><TH>Name</TH><TH>Role</TH><TH>Reach</TH><TH>Preferred</TH><TH>Birthday</TH><TH>Communications</TH></tr></THead>
          <TBody>
            {v.client.contacts.length === 0 ? <TR><TD colSpan={6} className="py-4 text-center text-muted">No contacts.</TD></TR> : null}
            {v.client.contacts.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}{c.isPrimary ? <Badge className="ml-1" tone="brand">Primary</Badge> : null}</TD>
                <TD>{c.role || "—"}</TD>
                <TD className="text-xs">{[c.email, c.phone, c.whatsapp ? `WA ${c.whatsapp}` : null].filter(Boolean).join(" · ") || "—"}</TD>
                <TD>{words(c.preferredChannel)}</TD>
                <TD className="whitespace-nowrap">{c.birthday ? formatDate(c.birthday) : "—"}</TD>
                <TD>
                  {c.optOutCampaigns ? <Badge tone="red">Opted out</Badge> : <Badge tone="green">Subscribed</Badge>}{" "}
                  {manage ? <ConfirmAction trigger={c.optOutCampaigns ? "Opt in" : "Opt out"} variant="ghost" title={c.optOutCampaigns ? "Opt back in" : "Opt out of client communications"} description="Greetings and firm updates respect this; statutory work messages are not affected." action={optOutAction.bind(null, c.id, id, !c.optOutCampaigns)} /> : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      {dates.length ? (
        <Card>
          <CardHeader><CardTitle>Key dates in the next 30 days</CardTitle></CardHeader>
          <CardContent><ul className="space-y-1 text-sm">{dates.map((d, i) => <li key={i}>{formatDate(d.date)} — {d.kind === "BIRTHDAY" ? `Birthday: ${d.who}` : `Incorporation anniversary (${d.years} years)`}</li>)}</ul></CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Communication log</CardTitle></CardHeader>
        <CardContent>
          {v.activities.length === 0 ? <p className="text-sm text-muted">Nothing logged yet.</p> : null}
          <ol className="space-y-3">
            {v.activities.map((a) => (
              <li key={a.id} className="border-l-2 border-line pl-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge>{kind(a.kind)}</Badge><span className="text-xs text-muted">{formatDate(a.date)} · {v.people.get(a.byUserId) ?? ""}{a.engagementId ? ` · ${v.engNames.get(a.engagementId) ?? ""}` : ""}{a.leadId ? " · lead" : ""}</span></div>
                <p className="mt-1 whitespace-pre-wrap">{a.notes}</p>
                {a.nextFollowUp ? <p className="text-xs text-muted">Follow up {formatDate(a.nextFollowUp)}</p> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
