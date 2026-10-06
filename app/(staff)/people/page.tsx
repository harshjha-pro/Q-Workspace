import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listUsers } from "@/server/services/users/service";
import { can } from "@/server/permissions/guards";
import { PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { PeopleTable } from "./people-table";
import { canListPeople } from "@/components/nav";
import { ROLE_LABELS, type Role } from "@/server/domain/enums";
import { formatDateTime } from "@/server/lib/dates";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ inactive?: string }> }) {
  const actor = await requireStaff();
  if (!canListPeople(actor)) redirect("/denied");
  const sp = await searchParams;
  const rows = await listUsers(actor, { includeInactive: sp.inactive === "1" });
  return (
    <div>
      <PageHeader
        title="People"
        subtitle="Logins, roles and employee records. Employee ID is internal and never typed at login."
        actions={
          <>
            <Link className={buttonVariants({ variant: "secondary" })} href={sp.inactive === "1" ? "/people" : "/people?inactive=1"}>{sp.inactive === "1" ? "Hide inactive" : "Show inactive"}</Link>
            {can(actor, "users.manage") ? <Link className={buttonVariants()} href="/people/new">Add person</Link> : null}
          </>
        }
      />
      <PeopleTable rows={rows.map((u) => ({
        id: u.id, name: u.displayName, username: u.username, role: ROLE_LABELS[u.role as Role] + (u.isSenior ? " (Senior)" : ""),
        designation: u.designation?.name ?? "", manager: u.reportingManager?.displayName ?? "", twoFactor: u.totpEnabled, active: u.active,
        lastLogin: u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never",
      }))} />
    </div>
  );
}
