import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { listClients } from "@/server/services/clients/service";
import { listStageTemplates } from "@/server/services/engagements/service";
import { PageHeader } from "@/components/ui/card";
import { estimatesByType } from "@/server/services/analytics/estimates";
import { NewEngagementForm } from "./new-form";

export const metadata = { title: "New engagement" };

export default async function NewEngagementPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "engagement.manage");
  const sp = await searchParams;
  const [clients, templates] = await Promise.all([listClients(actor, { status: "ACTIVE" }), listStageTemplates()]);
  const estimates = await estimatesByType(actor, templates.map((t) => t.code));
  return (
    <div>
      <PageHeader title="New engagement" subtitle="Recurring compliance engagements are created by the compliance calendar in Phase 2; use this for one-time work or set-up." />
      <NewEngagementForm
        clients={clients.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        templates={templates.map((t) => ({ code: t.code, name: t.name, stages: t.versions[0]?.stages.map((s) => s.name) ?? [] }))}
        defaultClientId={sp.client}
        estimates={estimates}
      />
    </div>
  );
}
