import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listCredentials, grantsFor, viewLog, PORTALS } from "@/server/services/registers/vault";
import { can, scopeOf } from "@/server/permissions/guards";
import { assertClientAccess } from "@/server/permissions/scopes";
import { load, requireCap } from "@/lib/page";
import { db } from "@/server/lib/db";
import { formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { userNames } from "../../../registers/_lib/pickers";
import { PORTAL_LABELS, FIELD_LABELS } from "./labels";
import { RevealButton } from "./reveal";
import { AddCredentialDialog, ChangePasswordDialog, DeactivateDialog, GrantDialog, RevokeGrantDialog } from "./vault-dialogs";

export const metadata = { title: "Credentials" };

export default async function VaultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  requireCap(actor, "vault.view");
  await load(() => assertClientAccess(actor, "vault.view", id));
  const client = await db().client.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, code: true } });
  const creds = await listCredentials(actor, id);
  const canManage = can(actor, "vault.manage");
  const canGrant = can(actor, "vault.grant");
  const needsGrant = scopeOf(actor, "vault.view") === "granted";
  const credName = (c: { portal: string; label: string }) => [PORTAL_LABELS[c.portal] ?? c.portal, c.label].filter(Boolean).join(" · ");

  const [grants, logs] = await Promise.all([
    canGrant ? grantsFor(actor, id) : Promise.resolve([]),
    canManage ? Promise.all(creds.map((c) => viewLog(actor, c.id))) : Promise.resolve([]),
  ]);
  const [people, grantees] = await Promise.all([
    canGrant
      ? db().user.findMany({ where: { active: true, isSystem: false, role: { in: ["STAFF", "ARTICLE"] } }, select: { id: true, displayName: true, role: true }, orderBy: { displayName: "asc" } })
      : Promise.resolve([]),
    userNames([...grants.flatMap((g) => [g.userId, g.grantedById]), ...logs.flat().map((l) => l.userId)]),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Portal credentials"
        subtitle={<span className="flex flex-wrap items-center gap-2"><Link href={`/clients/${client.id}`} className="underline">{client.name}</Link><span className="font-mono">{client.code}</span></span>}
        actions={canManage ? <AddCredentialDialog clientId={id} portals={[...PORTALS]} today={todayIst()} /> : null}
      />
      <Alert tone="info">Secrets stay hidden until you press Show. Each view is logged with your name and the time, and the value disappears after 30 seconds.</Alert>

      {creds.length === 0 ? (
        needsGrant ? (
          <EmptyState title="No credentials you can view">You need a grant from the Manager or Partner on this client to see its portal logins.</EmptyState>
        ) : (
          <EmptyState title="No credentials recorded">{canManage ? "Use Add credential to store the first portal login." : null}</EmptyState>
        )
      ) : (
        <div className="space-y-3">
          {creds.map((c, i) => (
            <Card key={c.id}>
              <CardHeader>
                <div>
                  <CardTitle>{credName(c)}</CardTitle>
                  <p className="text-xs text-muted">Last changed {formatDate(c.lastChangedOn) || "unknown"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {c.changeDue ? <Badge tone="amber">Change due</Badge> : null}
                  {canManage ? <ChangePasswordDialog clientId={id} id={c.id} name={credName(c)} /> : null}
                  {canManage ? <DeactivateDialog clientId={id} id={c.id} name={credName(c)} /> : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-start gap-3">
                <RevealButton credentialId={c.id} field="USERNAME" label="Username" />
                <RevealButton credentialId={c.id} field="PASSWORD" label="Password" />
                <RevealButton credentialId={c.id} field="EXTRA" label="Other details" />
              </CardContent>
              {canManage ? (
                <details className="border-t border-line">
                  <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-muted">View log ({logs[i]?.length ?? 0})</summary>
                  <Table>
                    <THead><tr><TH>When</TH><TH>Who</TH><TH>Field</TH><TH>IP</TH></tr></THead>
                    <TBody>
                      {(logs[i] ?? []).length === 0 ? <TR><TD colSpan={4} className="text-muted">Nobody has viewed this yet.</TD></TR> : null}
                      {(logs[i] ?? []).map((l) => (
                        <TR key={l.id}>
                          <TD className="whitespace-nowrap">{formatDateTime(l.viewedAt)}</TD>
                          <TD>{grantees.get(l.userId) ?? l.userId}</TD>
                          <TD>{FIELD_LABELS[l.field] ?? l.field}</TD>
                          <TD className="font-mono text-xs">{l.ip ?? ""}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </details>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {canGrant ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Access grants ({grants.length})</CardTitle>
              <p className="text-xs text-muted">Partners, Practice Admin and the client&apos;s Manager see credentials through their role. Staff and Articles need a grant.</p>
            </div>
            <GrantDialog
              clientId={id}
              people={people.map((p) => ({ id: p.id, name: `${p.displayName} (${p.role.toLowerCase()})` }))}
              credentials={creds.map((c) => ({ id: c.id, name: credName(c) }))}
            />
          </CardHeader>
          <Table>
            <THead><tr><TH>Person</TH><TH>Access to</TH><TH>Granted</TH><TH>By</TH><TH /></tr></THead>
            <TBody>
              {grants.length === 0 ? <TR><TD colSpan={5} className="text-muted">No grants.</TD></TR> : null}
              {grants.map((g) => {
                const cred = g.credentialId ? creds.find((c) => c.id === g.credentialId) : null;
                const who = grantees.get(g.userId) ?? "Unknown";
                return (
                  <TR key={g.id}>
                    <TD>{who}</TD>
                    <TD>{g.credentialId ? (cred ? credName(cred) : "A deactivated credential") : "All credentials"}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(g.grantedAt)}</TD>
                    <TD>{grantees.get(g.grantedById) ?? ""}</TD>
                    <TD><RevokeGrantDialog clientId={id} grantId={g.id} who={who} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
