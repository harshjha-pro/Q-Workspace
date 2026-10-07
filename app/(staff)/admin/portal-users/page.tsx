import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { listPortalUsers, portalInviteClients } from "@/server/services/portal/accounts";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { inviteAction, newLinkAction, linkClientAction, unlinkClientAction, setActiveAction, resetTotpAction } from "./actions";
import { ActiveDialog, AddClientDialog, InviteDialog, NewLinkDialog, RemoveClientDialog, ResetTotpDialog } from "./ui";

export const metadata = { title: "Portal users" };

const LINK = { NONE: ["No link", "neutral"], OPEN: ["Link open", "amber"], USED: ["Link used", "green"], EXPIRED: ["Link expired", "red"], REVOKED: ["Link replaced", "neutral"] } as const;

/** Client portal accounts (P4-02): invite links, group access, deactivation. Partners and the Practice Admin. */
export default async function PortalUsersPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "portal.accounts.manage");
  const { client } = await searchParams;
  const [users, clients] = await Promise.all([listPortalUsers(actor, { clientId: client }), portalInviteClients(actor)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Portal users" subtitle="Client users sign in with an invite link that the firm sends itself. Nothing is emailed by the system." actions={<InviteDialog action={inviteAction} clients={clients} />} />
      <Card>
        <Table>
          <THead><tr><TH>User</TH><TH>Clients</TH><TH>Status</TH><TH>Last sign-in</TH><TH /></tr></THead>
          <TBody>
            {users.length === 0 ? <TR><TD colSpan={5} className="text-sm text-muted">No portal users yet.</TD></TR> : null}
            {users.map((u) => {
              const [linkLabel, linkTone] = LINK[u.linkStatus];
              return (
                <TR key={u.id} className={u.active ? undefined : "opacity-60"}>
                  <TD><div className="font-medium">{u.name}</div><div className="text-xs text-muted">{u.email}{u.mobile ? ` · ${u.mobile}` : ""}</div></TD>
                  <TD>
                    <ul className="space-y-1 text-sm">
                      {u.clients.map((c) => <li key={c.id} className="flex items-center gap-1">{c.name}<RemoveClientDialog action={unlinkClientAction.bind(null, u.id)} clientName={c.name} clientId={c.id} /></li>)}
                    </ul>
                    {u.active ? <AddClientDialog action={linkClientAction.bind(null, u.id)} clients={clients.filter((c) => !u.clients.some((x) => x.id === c.id))} /> : null}
                  </TD>
                  <TD className="space-x-1 text-sm">
                    {u.active ? null : <Badge tone="red">Inactive</Badge>}
                    <Badge tone={linkTone}>{linkLabel}</Badge>
                    {u.totpEnabled ? <Badge tone="green">2FA</Badge> : null}
                    {u.lockedUntil ? <Badge tone="red">Locked</Badge> : null}
                  </TD>
                  <TD className="text-sm">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</TD>
                  <TD className="space-x-1 whitespace-nowrap">
                    {u.active ? <NewLinkDialog action={newLinkAction.bind(null, u.id)} /> : null}
                    {u.totpEnabled ? <ResetTotpDialog action={resetTotpAction.bind(null, u.id)} /> : null}
                    <ActiveDialog action={setActiveAction.bind(null, u.id, !u.active)} active={u.active} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
