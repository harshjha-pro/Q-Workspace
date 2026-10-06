import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { listTemplates } from "@/server/services/templates/service";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DiscardDraft, DraftEditor, PublishDialog } from "./templates-ui";
import type { StageDraft } from "./actions";

export const metadata = { title: "Stage templates" };

const STATUS_TONE = { ACTIVE: "green", DRAFT: "amber", RETIRED: "neutral" } as const;
const LEVEL_LABEL: Record<string, string> = { SENIOR: "Senior review", MANAGER: "Manager review", PARTNER: "Partner review" };

type Template = Awaited<ReturnType<typeof listTemplates>>[number];
type Version = Template["versions"][number];

export default async function TemplatesPage() {
  const actor = await requireStaff();
  requireCap(actor, "templates.manage");
  const canApprove = can(actor, "templates.approve");
  const templates = await load(() => listTemplates(actor));
  return (
    <div className="space-y-4">
      <PageHeader title="Stage templates" subtitle="Stages every task moves through. Changes are made as a draft and published by a Partner; open tasks keep their version unless moved." />
      {templates.length === 0 ? <EmptyState title="No templates" /> : templates.map((t) => {
        const active = t.versions.filter((v) => v.status === "ACTIVE");
        const draft = t.versions.find((v) => v.status === "DRAFT");
        const retired = t.versions.filter((v) => v.status === "RETIRED");
        // Old stage indexes that may hold open tasks: every stage of the active version(s).
        const oldStages = [...new Map(active.flatMap((v) => v.stages.map((s) => [s.index, { index: s.index, name: s.name }] as const))).values()].sort((a, b) => a.index - b.index);
        const openOnActive = active.reduce((n, v) => n + v._count.tasks, 0);
        const seed: StageDraft[] = (active[0]?.stages ?? []).map((s) => ({
          name: s.name, reviewLevel: s.reviewLevel as StageDraft["reviewLevel"], isClientApproval: s.isClientApproval, isFiling: s.isFiling, requiresUdin: s.requiresUdin, requiresDsc: s.requiresDsc,
        }));
        return (
          <Card key={t.id}>
            <CardHeader>
              <div>
                <CardTitle>{t.name}</CardTitle>
                <p className="font-mono text-xs text-muted">{t.code} · {t.engagementType}{t.active ? "" : " · inactive"}</p>
              </div>
              {!draft ? <DraftEditor templateId={t.id} templateName={t.name} initial={seed} /> : null}
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {[...(draft ? [draft] : []), ...active].map((v) => (
                <VersionBlock key={v.id} v={v} actions={v.status === "DRAFT" ? (
                  <div className="flex flex-wrap items-start gap-2">
                    {canApprove ? <PublishDialog versionId={v.id} version={v.version} newStages={v.stages.map((s) => ({ index: s.index, name: s.name }))} oldStages={oldStages} openTasks={openOnActive} /> : <span className="text-xs text-muted">Waiting for a Partner to publish</span>}
                    <DiscardDraft versionId={v.id} />
                  </div>
                ) : null} />
              ))}
              {retired.length ? (
                <details className="md:col-span-2">
                  <summary className="cursor-pointer text-sm text-brand">Retired versions ({retired.length})</summary>
                  <div className="mt-2 grid gap-4 md:grid-cols-2">{retired.map((v) => <VersionBlock key={v.id} v={v} />)}</div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VersionBlock({ v, actions }: { v: Version; actions?: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">v{v.version}</h3>
        <Badge tone={STATUS_TONE[v.status as keyof typeof STATUS_TONE] ?? "neutral"}>{v.status.toLowerCase()}</Badge>
        <span className="text-xs text-muted">{v.status === "DRAFT" ? "draft" : `from ${formatDate(v.effectiveFrom)}`} · {v._count.tasks} open task{v._count.tasks === 1 ? "" : "s"}</span>
      </div>
      {v.note ? <p className="mb-2 text-xs text-muted">{v.note}</p> : null}
      <ol className="space-y-1 text-sm">
        {v.stages.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-1.5">
            <span className="w-5 text-xs text-muted">{s.index + 1}.</span>
            <span>{s.name}</span>
            {LEVEL_LABEL[s.reviewLevel] ? <Badge tone="violet">{LEVEL_LABEL[s.reviewLevel]}</Badge> : null}
            {s.isClientApproval ? <Badge tone="amber">Client approval</Badge> : null}
            {s.isFiling ? <Badge tone="green">Filing</Badge> : null}
            {s.requiresUdin ? <Badge tone="blue">UDIN</Badge> : null}
            {s.requiresDsc ? <Badge tone="blue">DSC</Badge> : null}
          </li>
        ))}
      </ol>
      {actions ? <div className="mt-3">{actions}</div> : null}
    </section>
  );
}
