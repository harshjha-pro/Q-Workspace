import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { getUser } from "@/server/services/users/service";
import { getEmployeeProfile } from "@/server/services/employees/service";
import { listStates } from "@/server/services/clients/service";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Employee record" };

export default async function ProfileEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  requireCap(actor, "hr.records.manage");
  const u = await load(() => getUser(actor, id));
  const p = await getEmployeeProfile(actor, id);
  const states = await listStates();
  return (
    <div>
      <PageHeader title={`Employee record — ${u.displayName}`} subtitle="PAN, Aadhaar and bank details are encrypted. Leave them blank to keep the stored values." />
      <Card><CardContent><ProfileForm userId={id} states={states.map((s) => ({ code: s.code, name: s.name }))} p={p ? { ...p, pan: null, bankAccount: null } : null} hasPan={Boolean(p?.pan)} /></CardContent></Card>
    </div>
  );
}
