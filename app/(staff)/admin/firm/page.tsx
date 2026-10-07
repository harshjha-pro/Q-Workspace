import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { db } from "@/server/lib/db";
import { getFirmProfile, firmProfileGaps } from "@/server/services/billing/service";
import { PageHeader, Card, CardContent, Alert } from "@/components/ui/card";
import { FirmForm } from "./firm-form";

export const metadata = { title: "Firm profile" };

export default async function FirmProfilePage() {
  const actor = await requireStaff();
  requireCap(actor, "settings.manage");
  const [firm, states] = await Promise.all([getFirmProfile(), db().state.findMany({ select: { code: true, name: true, gstCode: true }, orderBy: { name: "asc" } })]);
  const gaps = firmProfileGaps(firm);
  return (
    <div className="space-y-4">
      <PageHeader title="Firm profile" subtitle="The firm's own details printed on every invoice (supplier name, address, GSTIN, bank and UPI)." />
      {gaps.length ? <Alert tone="warn">Invoices cannot be issued until these are filled in: {gaps.join(", ")}.</Alert> : null}
      <Card><CardContent><FirmForm firm={firm} states={states} /></CardContent></Card>
    </div>
  );
}
