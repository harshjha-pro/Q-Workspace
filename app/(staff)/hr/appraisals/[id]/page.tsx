import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { getReview, CYCLE_LABELS, RATING_LABELS, REVIEW_LABELS, type CycleStatus } from "@/server/services/hr/appraisals";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "../../../work/action-button";
import { GoalDialog, ManagerReviewForm, ModerateForm, SelfReviewForm } from "../ui";
import { removeGoalAction } from "../actions";
import { EvidencePanel } from "../evidence";

export const metadata = { title: "Appraisal" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  const d = await load(() => getReview(actor, id));
  const r = d.review;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-sm"><Link href="/hr/appraisals" className="text-brand hover:underline">← Appraisals</Link></p>
      <PageHeader title={`${d.name} · ${d.cycle.name}`} subtitle={<>Manager {d.manager || "—"} · Moderation {d.partner || "—"} · <Badge tone="blue">{CYCLE_LABELS[d.cycle.status as CycleStatus]}</Badge> <Badge tone={r.status === "FINAL" ? "green" : "neutral"}>{REVIEW_LABELS[r.status] ?? r.status}</Badge></>} />

      <Card>
        <CardHeader><CardTitle>Goals</CardTitle>{d.can.editGoals ? <GoalDialog reviewId={r.id} /> : null}</CardHeader>
        <CardContent>
          {d.goals.length === 0 ? <p className="text-sm text-muted">No goals set.</p> : (
            <ul className="divide-y divide-line">
              {d.goals.map((g) => (
                <li key={g.id} className="space-y-1 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{g.title}{g.weightPct ? <span className="font-normal text-muted"> · {g.weightPct}%</span> : null}</span>
                    <span className="flex items-center gap-2"><Badge>{g.status.toLowerCase().replace("_", " ")}</Badge>{d.can.editGoals ? <ActionButton action={removeGoalAction.bind(null, g.id, r.id)} variant="ghost" confirm="Remove this goal?">Remove</ActionButton> : null}</span>
                  </div>
                  {g.description ? <p className="text-muted">{g.description}</p> : null}
                  {g.selfComment ? <p><span className="text-muted">Self: </span>{g.selfComment}</p> : null}
                  {g.managerComment ? <p><span className="text-muted">Manager: </span>{g.managerComment}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <EvidencePanel e={d.evidence} />

      <Card>
        <CardHeader><CardTitle>Self-review</CardTitle></CardHeader>
        <CardContent>{d.can.selfReview ? <SelfReviewForm reviewId={r.id} goals={d.goals} /> : <p className="whitespace-pre-line text-sm">{r.selfReview || <span className="text-muted">Not submitted yet.</span>}</p>}</CardContent>
      </Card>

      {(d.access.manager || d.access.partner || d.access.hr || r.status === "FINAL") ? (
        <Card>
          <CardHeader><CardTitle>Manager review</CardTitle>{r.managerRating ? <Badge tone="violet">{RATING_LABELS[r.managerRating]}</Badge> : null}</CardHeader>
          <CardContent>{d.can.managerReview ? <ManagerReviewForm reviewId={r.id} goals={d.goals} /> : <p className="whitespace-pre-line text-sm">{r.managerReview || <span className="text-muted">Not submitted yet.</span>}</p>}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Moderation and final rating</CardTitle></CardHeader>
        <CardContent>
          {d.can.moderate ? <ModerateForm reviewId={r.id} managerRating={r.managerRating} /> : r.finalRating ? (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted">Final rating</dt><dd className="font-semibold">{RATING_LABELS[r.finalRating]}</dd></div>
              <div><dt className="text-xs text-muted">Moderated rating</dt><dd>{r.moderatedRating ? RATING_LABELS[r.moderatedRating] : "—"}</dd></div>
              {r.incrementRecommendationBp != null ? <div><dt className="text-xs text-muted">Increment recommended</dt><dd>{r.incrementRecommendationBp / 100}%</dd></div> : null}
            </dl>
          ) : <p className="text-sm text-muted">Not moderated yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
