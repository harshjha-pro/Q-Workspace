import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listEngagements } from "@/server/services/engagements/service";
import { can } from "@/server/permissions/guards";
import { requireCap } from "@/lib/page";
import { PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EngagementsTable, type EngagementRow } from "./engagements-table";

export const metadata = { title: "Engagements" };

export default async function EngagementsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "engagement.view");
  const sp = await searchParams;
  const rows = await listEngagements(actor, { status: sp.status });
  const data: EngagementRow[] = rows.map((e) => ({
    id: e.id, code: e.code, name: e.name, client: e.client.name, clientId: e.client.id, serviceLine: e.serviceLine, recurrence: e.recurrence,
    feeBasis: e.feeBasis, feePaise: e.canSeeFees ? e.feePaise : null, budgetMinutes: e.budgetMinutes, status: e.status,
    team: e.assignments.map((a) => a.user.displayName).join(", "),
  }));
  return (
    <div>
      <PageHeader title="Engagements" subtitle="Client → Engagement → Task. Staff see only engagements they are assigned to."
        actions={can(actor, "engagement.manage") ? <Link className={buttonVariants()} href="/engagements/new">New engagement</Link> : null} />
      <EngagementsTable rows={data} showFees={can(actor, "billing.view")} />
    </div>
  );
}
