import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { db } from "@/server/lib/db";
import { listUserOptions } from "@/server/services/users/service";
import { PageHeader } from "@/components/ui/card";
import { NewUserForm } from "./new-user-form";

export const metadata = { title: "Add person" };

export default async function NewUserPage() {
  const actor = await requireStaff();
  requireCap(actor, "users.manage");
  const [designations, managers] = await Promise.all([db().designation.findMany({ orderBy: { level: "desc" } }), listUserOptions(actor, ["PARTNER", "MANAGER"])]);
  return (
    <div>
      <PageHeader title="Add person" subtitle="Creates a login with a one-time temporary password. Partner, Practice Admin and HR Admin roles need a Partner." />
      <NewUserForm options={{ designations, managers: managers.map((m) => ({ id: m.id, name: m.displayName })) }} />
    </div>
  );
}
