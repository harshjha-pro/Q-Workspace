import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { formatDate, todayIst } from "@/server/lib/dates";
import { getCandidate, STAGE_LABELS, type Stage } from "@/server/services/hr/recruitment";
import { canWrite, namesOf } from "@/server/services/hr/common";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ActionButton } from "../../../../work/action-button";
import { peopleOptions } from "../../../../registers/_lib/pickers";
import { MoveStageDialog, OfferLetterDialog, ScheduleInterviewDialog, ScorecardDialog } from "../../ui";
import { toggleOnboardingAction } from "../../actions";

export const metadata = { title: "Candidate" };

const REC: Record<string, string> = { STRONG_YES: "Strong yes", YES: "Yes", NO: "No", STRONG_NO: "Strong no" };

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  const c = await load(() => getCandidate(actor, id));
  const writer = canWrite(actor, "recruitment.manage");
  const people = writer ? await peopleOptions(["PARTNER", "MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN", "HR_ADMIN"]) : [];
  const names = await namesOf([...c.interviews.map((i) => i.interviewerId), c.joinedUserId]);
  const today = todayIst();
  const open = c.stage !== "JOINED" && c.stage !== "REJECTED";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-sm"><Link href={`/hr/recruitment/${c.openingId}`} className="text-brand hover:underline">← {c.opening.title}</Link></p>
      <PageHeader
        title={c.name}
        subtitle={<>{[c.email, c.phone, c.source].filter(Boolean).join(" · ")} <Badge tone={c.stage === "JOINED" ? "green" : c.stage === "REJECTED" ? "red" : "blue"}>{STAGE_LABELS[c.stage as Stage]}</Badge></>}
        actions={writer && open ? (
          <>
            <MoveStageDialog candidateId={c.id} people={people} />
            <ScheduleInterviewDialog candidateId={c.id} people={people} today={today} />
            {c.stage !== "APPLIED" ? <OfferLetterDialog candidateId={c.id} today={today} /> : null}
          </>
        ) : null}
      />
      {c.rejectedReason ? <Alert tone="warn">Rejected: {c.rejectedReason}</Alert> : null}

      {c.offerLetterDocId ? (
        <Card>
          <CardHeader><CardTitle>Offer letter</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a href={`/api/hr/download/offer/${c.id}?format=pdf`} className={buttonVariants({ size: "sm", variant: "secondary" })}>Download PDF</a>
            <a href={`/api/hr/download/offer/${c.id}?format=docx`} className={buttonVariants({ size: "sm", variant: "secondary" })}>Download Word</a>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Interviews</CardTitle></CardHeader>
        <CardContent>
          {c.interviews.length === 0 ? <p className="text-sm text-muted">No interviews scheduled.</p> : (
            <ul className="divide-y divide-line">
              {c.interviews.map((iv) => {
                const scores = JSON.parse(iv.scoreJson) as Record<string, number>;
                const mine = iv.interviewerId === actor.userId;
                return (
                  <li key={iv.id} className="space-y-1 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-medium">{names.get(iv.interviewerId) ?? ""}</span> · {formatDate(iv.scheduledAt)}</span>
                      <span className="flex items-center gap-2">
                        {iv.recommendation ? <Badge tone={iv.recommendation.includes("YES") ? "green" : "red"}>{REC[iv.recommendation]}</Badge> : <Badge tone="amber">Scorecard pending</Badge>}
                        {mine || writer ? <ScorecardDialog interviewId={iv.id} candidateId={c.id} /> : null}
                      </span>
                    </div>
                    {Object.keys(scores).length ? <div className="text-xs text-muted">{Object.entries(scores).map(([k, v]) => `${k}: ${v}/5`).join(" · ")}</div> : null}
                    {iv.notes ? <p className="text-xs">{iv.notes}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {c.joinedUserId ? (
        <Card>
          <CardHeader><CardTitle>Onboarding · {names.get(c.joinedUserId) ?? ""}</CardTitle><Link href={`/people/${c.joinedUserId}`} className="text-sm text-brand hover:underline">Open in People</Link></CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {c.onboarding.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className={i.done ? "text-muted line-through" : ""}>{i.label}</span>
                  {writer ? <ActionButton action={toggleOnboardingAction.bind(null, i.id, !i.done, c.id)} variant={i.done ? "ghost" : "secondary"}>{i.done ? "Reopen" : "Mark done"}</ActionButton> : i.done ? <Badge tone="green">Done</Badge> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : c.stage === "OFFER" ? <Alert>When the candidate accepts, create their login under <Link href="/people/new" className="underline">People → New person</Link>, then move them to Joined to start onboarding.</Alert> : null}
    </div>
  );
}
