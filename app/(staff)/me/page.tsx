import Link from "next/link";
import { requireStaff } from "@/server/context";
import { db } from "@/server/lib/db";
import { getEmployeeProfile } from "@/server/services/employees/service";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_LABELS, LOCATION_LABELS } from "@/server/domain/enums";
import { ProfileView } from "../people/profile-view";
import { EmployeeDocuments } from "../people/documents";
import { listEmployeeDocuments } from "@/server/services/documents/service";

export const metadata = { title: "My profile" };

export default async function MePage() {
  const actor = await requireStaff();
  const u = await db().user.findUniqueOrThrow({ where: { id: actor.userId }, include: { designation: true, reportingManager: true, teamMemberships: { where: { toDate: null }, include: { team: true } } } });
  const profile = await getEmployeeProfile(actor, actor.userId);
  return (
    <div className="space-y-4">
      <PageHeader title="My profile" actions={<Link className={buttonVariants({ variant: "secondary" })} href="/account/security">Password & two-factor login</Link>} />
      <Card>
        <CardHeader><CardTitle>{u.displayName}</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
          <p><span className="text-muted">Role:</span> {ROLE_LABELS[actor.role]}{u.isSenior ? " (Senior)" : ""}</p>
          <p><span className="text-muted">Designation:</span> {u.designation?.name ?? "—"}</p>
          <p><span className="text-muted">Reports to:</span> {u.reportingManager?.displayName ?? "—"}</p>
          <p><span className="text-muted">Default location:</span> {LOCATION_LABELS[u.defaultLocation as "OFFICE"]}</p>
          <p><span className="text-muted">Client teams:</span> {u.teamMemberships.map((m) => m.team.name).join(", ") || "—"}</p>
          <p><span className="text-muted">Username:</span> <span className="font-mono">{u.username}</span></p>
        </CardContent>
      </Card>
      {profile ? <ProfileView p={profile} /> : <EmptyState title="No employee record yet">HR will add your record.</EmptyState>}
      {profile ? <EmployeeDocuments userId={actor.userId} docs={await listEmployeeDocuments(actor, actor.userId)} canUpload /> : null}
      <p className="text-xs text-muted">Leave, payslips, CPE and appraisal arrive in later phases.</p>
    </div>
  );
}
