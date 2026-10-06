import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { db } from "@/server/lib/db";
import { can } from "@/server/permissions/guards";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { formatMinutes } from "@/server/lib/money";
import { listCorrections } from "@/server/services/work/service";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DecideCorrection } from "./decide-form";

export const metadata = { title: "Corrections" };

const TONE: Record<string, BadgeTone> = { PENDING: "amber", APPROVED: "green", REJECTED: "red" };
type Req = Awaited<ReturnType<typeof listCorrections>>[number];

async function entryInfo(reqs: Req[]) {
  const [entries, users] = await Promise.all([
    db().workEntry.findMany({
      where: { id: { in: reqs.map((r) => r.workEntryId) } },
      include: { client: { select: { name: true } }, engagement: { select: { name: true } }, task: { select: { title: true } }, internalCategory: { select: { name: true } } },
    }),
    db().user.findMany({ where: { id: { in: reqs.map((r) => r.requestedById) } }, select: { id: true, displayName: true } }),
  ]);
  return { entries: new Map(entries.map((e) => [e.id, e])), users: new Map(users.map((u) => [u.id, u.displayName])) };
}

function Proposed({ json, minutes, description }: { json: string; minutes: number; description: string }) {
  let p: { minutes?: number; description?: string } = {};
  try {
    p = JSON.parse(json) as typeof p;
  } catch {
    /* show nothing */
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {p.minutes !== undefined ? <li>Time: {formatMinutes(minutes)} → {p.minutes === 0 ? <strong>remove entry</strong> : <strong>{formatMinutes(p.minutes)}</strong>}</li> : null}
      {p.description !== undefined ? <li>Description: <span className="text-muted line-through">{description || "—"}</span> → <strong>{p.description}</strong></li> : null}
    </ul>
  );
}

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "work.log");
  const canApprove = can(actor, "work.correction.approve");
  const tab = (await searchParams).tab === "approvals" && canApprove ? "approvals" : "mine";
  const reqs = await load(() => listCorrections(actor, tab));
  const { entries, users } = await entryInfo(reqs);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Correction requests" subtitle="Changes to entries in a locked week go through your manager or a partner." />
      {canApprove ? (
        <nav className="flex gap-1 border-b border-line" aria-label="Views">
          {[["mine", "My requests"], ["approvals", "To approve"]].map(([k, l]) => (
            <Link key={k} href={k === "mine" ? "/work/corrections" : "/work/corrections?tab=approvals"} aria-current={tab === k ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === k ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>{l}</Link>
          ))}
        </nav>
      ) : null}
      {reqs.length === 0 ? (
        <EmptyState title={tab === "mine" ? "No correction requests" : "Nothing waiting for you"} />
      ) : (
        <div className="space-y-3">
          {reqs.map((r) => {
            const e = entries.get(r.workEntryId);
            const what = e ? e.internalCategory?.name ?? [e.client?.name, e.task?.title ?? e.engagement?.name].filter(Boolean).join(" · ") : "Entry";
            return (
              <Card key={r.id}>
                <CardHeader>
                  <CardTitle>{tab === "approvals" ? `${users.get(r.requestedById) ?? "Someone"} — ` : ""}{e ? formatDate(e.date) : ""} · {what}</CardTitle>
                  <Badge tone={TONE[r.status] ?? "neutral"}>{r.status.toLowerCase()}</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  {e ? <Proposed json={r.proposedJson} minutes={e.minutes} description={e.description} /> : null}
                  <p className="text-sm"><span className="text-muted">Reason:</span> {r.reason}</p>
                  <p className="text-xs text-muted">Requested {formatDateTime(r.createdAt)}{r.decidedAt ? ` · decided ${formatDateTime(r.decidedAt)}` : ""}{r.decisionNote ? ` · “${r.decisionNote}”` : ""}</p>
                  {tab === "approvals" ? <DecideCorrection id={r.id} /> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
