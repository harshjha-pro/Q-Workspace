import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getUser, custodyReport, listUserOptions } from "@/server/services/users/service";
import { getEmployeeProfile } from "@/server/services/employees/service";
import { can } from "@/server/permissions/guards";
import { db } from "@/server/lib/db";
import { load } from "@/lib/page";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_LABELS, LOCATION_LABELS, type Role } from "@/server/domain/enums";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { ProfileView } from "../profile-view";
import { PersonAdminActions } from "./admin-actions";
import { EmployeeDocuments } from "../documents";
import { listEmployeeDocuments } from "@/server/services/documents/service";

export const metadata = { title: "Person" };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  const u = await load(() => getUser(actor, id));
  const profile = await getEmployeeProfile(actor, id).catch(() => null);
  const isAdmin = can(actor, "users.manage");
  const docs = await listEmployeeDocuments(actor, id);
  const canSeeDocs = actor.userId === id || can(actor, "hr.records.manage") || actor.role === "PARTNER";
  const custody = isAdmin ? await custodyReport(actor, id) : null;
  const options = isAdmin
    ? { designations: await db().designation.findMany({ orderBy: { level: "desc" } }), managers: (await listUserOptions(actor, ["PARTNER", "MANAGER"])).filter((m) => m.id !== id).map((m) => ({ id: m.id, name: m.displayName })) }
    : null;
  return (
    <div className="space-y-4">
      <PageHeader
        title={u.displayName}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{u.username}</span><span>{ROLE_LABELS[u.role as Role]}{u.isSenior ? " (Senior)" : ""}</span>{u.active ? <Badge tone="green">active</Badge> : <Badge tone="red">inactive since {formatDateTime(u.deactivatedAt)}</Badge>}</span>}
      />
      {isAdmin && options ? (
        <PersonAdminActions
          id={u.id}
          active={u.active}
          options={options}
          values={{ displayName: u.displayName, email: u.email, mobile: u.mobile, role: u.role, isSenior: u.isSenior, designationId: u.designationId, reportingManagerId: u.reportingManagerId, defaultLocation: u.defaultLocation, locationChangeable: u.locationChangeable }}
        />
      ) : null}
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
          <p><span className="text-muted">Email:</span> {u.email ?? "—"}</p>
          <p><span className="text-muted">Mobile:</span> {u.mobile ?? "—"}</p>
          <p><span className="text-muted">Designation:</span> {u.designation?.name ?? "—"}</p>
          <p><span className="text-muted">Reports to:</span> {u.reportingManager?.displayName ?? "—"}</p>
          <p><span className="text-muted">Default location:</span> {LOCATION_LABELS[u.defaultLocation as "OFFICE"]}{u.locationChangeable ? "" : " (fixed)"}</p>
          <p><span className="text-muted">Two-factor login:</span> {u.totpEnabled ? `on since ${formatDate(u.totpEnrolledAt?.toISOString().slice(0, 10))}` : "off"}</p>
          <p><span className="text-muted">Last login:</span> {formatDateTime(u.lastLoginAt) || "never"}</p>
          <p><span className="text-muted">Client teams:</span> {u.teamMemberships.map((m) => m.team.name).join(", ") || "—"}</p>
        </CardContent>
      </Card>
      {profile ? (
        <ProfileView p={profile} action={can(actor, "hr.records.manage") ? <Link className={buttonVariants({ size: "sm", variant: "secondary" })} href={`/people/${u.id}/profile`}>Edit record</Link> : null} />
      ) : can(actor, "hr.records.manage") ? (
        <EmptyState title="No employee record yet"><Link className="underline" href={`/people/${u.id}/profile`}>Create it</Link></EmptyState>
      ) : null}
      {profile && canSeeDocs ? <EmployeeDocuments userId={u.id} docs={docs} canUpload={can(actor, "hr.records.manage") || actor.userId === u.id} /> : null}
      {custody ? (
        <Card>
          <CardHeader><CardTitle>Custody and hand-over</CardTitle><span className="text-xs text-muted">Items to return or reassign at offboarding (spec 3.9).</span></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div><p className="font-medium">DSCs held</p>{custody.dscs.length ? custody.dscs.map((d) => <p key={d.id}>{d.holderName} (expires {formatDate(d.expiryDate)})</p>) : <p className="text-muted">None</p>}</div>
            <div><p className="font-medium">Physical documents</p>{custody.documents.length ? custody.documents.map((d) => <p key={d.id}>{d.documentDesc}</p>) : <p className="text-muted">None</p>}</div>
            <div><p className="font-medium">Firm assets</p>{custody.assets.length ? custody.assets.map((a) => <p key={a.id}>{a.tag} · {a.kind.toLowerCase()}</p>) : <p className="text-muted">None</p>}</div>
            <div><p className="font-medium">Active engagements</p>{custody.activeEngagements.length ? custody.activeEngagements.map((e) => <p key={e.id}><Link className="underline" href={`/engagements/${e.id}`}>{e.code} {e.name}</Link></p>) : <p className="text-muted">None</p>}</div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
