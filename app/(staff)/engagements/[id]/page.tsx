import { Comments } from "@/components/comments/comments";
import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getEngagement } from "@/server/services/engagements/service";
import { listUserOptions } from "@/server/services/users/service";
import { can } from "@/server/permissions/guards";
import { assertEngagementAccess } from "@/server/permissions/scopes";
import { load } from "@/lib/page";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { engagementStatusTone } from "@/components/status";
import { SERVICE_LINE_LABELS, FEE_BASIS_LABELS, type ServiceLine } from "@/server/domain/enums";
import { formatInr, formatMinutes } from "@/server/lib/money";
import { formatDate } from "@/server/lib/dates";
import { budgetEstimate } from "@/server/services/analytics/estimates";
import { EngagementActions, RemoveAssignment } from "./actions-ui";

export const metadata = { title: "Engagement" };

export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  const e = await load(() => getEngagement(actor, id));
  const canManage = await assertEngagementAccess(actor, "engagement.manage", id).then(() => true, () => false);
  const people = canManage ? await listUserOptions(actor, ["PARTNER", "MANAGER", "STAFF", "ARTICLE"]) : [];
  const estimate = canManage ? await budgetEstimate(actor, { engagementType: e.engagementType, clientId: e.client.id, excludeEngagementId: e.id }) : null;
  const active = e.assignments.filter((a) => !a.toDate);
  const stages = e.stageTemplateVersion?.stages ?? [];
  return (
    <div className="space-y-4">
      <PageHeader
        title={e.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{e.code}</span><Link href={`/clients/${e.client.id}`} className="underline">{e.client.name}</Link><Badge tone={engagementStatusTone(e.status)}>{e.status.toLowerCase().replace("_", " ")}</Badge></span>}
      />
      {canManage ? (
        <EngagementActions
          id={e.id}
          canSeeFees={e.canSeeFees && can(actor, "billing.approve")}
          current={{ name: e.name, status: e.status, budgetHours: e.budgetMinutes / 60, endDate: e.endDate ?? "", eqrRequired: e.eqrRequired, feeBasis: e.feeBasis, fee: e.feePaise / 100, rate: e.ratePaisePerHour / 100, chargeable: e.chargeable }}
          estimate={estimate ? { suggestedHours: estimate.suggestedHours, basis: estimate.basis } : null}
          people={people.map((p) => ({ id: p.id, name: `${p.displayName} (${p.role.toLowerCase()}${p.isSenior ? ", senior" : ""})` }))}
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted">Service line:</span> {SERVICE_LINE_LABELS[e.serviceLine as ServiceLine]}</p>
            <p><span className="text-muted">Type:</span> {e.recurrence === "RECURRING" ? "Recurring" : "One-time"} · {e.stageTemplateVersion?.template.name} (v{e.stageTemplateVersion?.version})</p>
            <p><span className="text-muted">Budget:</span> {e.budgetMinutes ? formatMinutes(e.budgetMinutes) : "not set"}</p>
            {e.canSeeFees ? <p><span className="text-muted">Fee basis:</span> {FEE_BASIS_LABELS[e.feeBasis as "FIXED"]} {e.feeBasis === "TIME" ? `@ ${formatInr(e.ratePaisePerHour)}/hr` : e.feePaise ? `· ${formatInr(e.feePaise)}` : ""} {e.chargeable ? "" : "(non-chargeable)"}</p> : null}
            <p><span className="text-muted">Dates:</span> {formatDate(e.startDate)} → {formatDate(e.endDate) || "open"}</p>
            {e.eqrRequired ? <p><Badge tone="violet">EQR required</Badge></p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Team</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {active.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <span>{a.user.displayName} <Badge>{a.role.toLowerCase()}</Badge></span>
                {canManage ? <RemoveAssignment engagementId={e.id} assignmentId={a.id} /> : null}
              </div>
            ))}
            {active.length === 0 ? <p className="text-muted">Nobody assigned yet.</p> : null}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Stages</CardTitle><span className="text-xs text-muted">Progress tracking per task starts in Phase 2.</span></CardHeader>
        <CardContent>
          <ol className="flex flex-wrap gap-2 text-xs">
            {stages.map((s) => (
              <li key={s.id} className="rounded border border-line bg-white px-2 py-1">
                {s.index + 1}. {s.name}
                {s.reviewLevel !== "NONE" ? <span className="ml-1 text-violet-700">· {s.reviewLevel.toLowerCase()} review</span> : null}
                {s.isClientApproval ? <span className="ml-1 text-amber-700">· client approval</span> : null}
                {s.requiresUdin ? <span className="ml-1 text-green-700">· UDIN</span> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Comments entityType="ENGAGEMENT" entityId={id} />
    </div>
  );
}
