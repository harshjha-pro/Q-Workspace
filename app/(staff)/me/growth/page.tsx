import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { myReviews, CYCLE_LABELS, REVIEW_LABELS, type CycleStatus } from "@/server/services/hr/appraisals";
import { listTraining, myCpe, mySkills, SKILL_LEVELS } from "@/server/services/hr/growth";
import { listLetters, myPolicies, LETTER_LABELS, POLICY_LABELS, type LetterKind } from "@/server/services/hr/letters";
import { myAssets } from "@/server/services/hr/assets";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ActionButton } from "../../work/action-button";
import { SkillLevel } from "../../hr/appraisals/ui";
import { AddCpeDialog } from "./ui";
import { acknowledgeAction, confirmSuggestionAction, deleteCpeAction } from "./actions";

export const metadata = { title: "Goals, CPE & skills" };
const hrs = (m: number) => `${Math.round((m / 60) * 10) / 10} hrs`;

export default async function MyGrowthPage() {
  const actor = await requireStaff();
  const today = todayIst();
  const [reviews, cpe, skills, training, letters, policies, assets] = await Promise.all([
    load(() => myReviews(actor)), load(() => myCpe(actor, today)), load(() => mySkills(actor)), load(() => listTraining(actor)),
    load(() => listLetters(actor)), load(() => myPolicies(actor)), load(() => myAssets(actor)),
  ]);
  const outstanding = policies.filter((p) => p.outstanding);
  const s = cpe.status;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Goals, CPE & skills" subtitle="Your appraisal goals, CPE log, skills, training, HR letters and policies." />
      {outstanding.length ? <Alert tone="warn">{outstanding.length} polic{outstanding.length === 1 ? "y needs" : "ies need"} your acknowledgment. <a href="#policies" className="underline">Read and acknowledge</a></Alert> : null}

      <Card>
        <CardHeader><CardTitle>My appraisal</CardTitle></CardHeader>
        <CardContent>
          {reviews.length === 0 ? <p className="text-sm text-muted">No appraisal cycle yet.</p> : (
            <ul className="divide-y divide-line">
              {reviews.map((r) => (
                <li key={r.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/hr/appraisals/${r.id}`} className="font-medium text-brand hover:underline">{r.cycle.name}</Link>
                    <span className="flex gap-1"><Badge tone="blue">{CYCLE_LABELS[r.cycle.status as CycleStatus]}</Badge><Badge>{REVIEW_LABELS[r.status] ?? r.status}</Badge></span>
                  </div>
                  {r.goals.length ? <ul className="mt-1 list-disc pl-5 text-muted">{r.goals.map((g) => <li key={g.id}>{g.title}</li>)}</ul> : <p className="text-muted">No goals yet: open it to set them.</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="cpe">
        <CardHeader><CardTitle>CPE</CardTitle><AddCpeDialog today={today} /></CardHeader>
        <CardContent className="space-y-3">
          {s ? (
            s.requirement && s.block ? (
              <div className="text-sm">
                <p>{s.institute} block {s.block.fromYear}–{s.block.toYear}: <strong>{hrs(s.completedMinutes)}</strong> of {hrs(s.requirement.totalMinutes)} ({hrs(s.structuredMinutes)} of {hrs(s.requirement.structuredMinutes)} structured); this year {hrs(s.currentYearMinutes)} of {hrs(s.requirement.perYearMinutes)}.</p>
                {s.shortfall.totalMinutes || s.shortfall.yearMinutes ? <p className="text-amber-800">Short by {hrs(s.shortfall.totalMinutes)} for the block, {hrs(s.shortfall.yearMinutes)} for this year. {s.block.daysLeft} days left in the block.</p> : <Badge tone="green">On track</Badge>}
                {!s.requirement.verified ? <p className="text-xs text-muted">Requirement not yet verified by a Partner.</p> : null}
              </div>
            ) : <p className="text-sm text-muted">No CPE requirement is configured for {s.institute}.</p>
          ) : <p className="text-sm text-muted">CPE requirements apply to qualified members (ICAI/ICSI membership on your record). You can still keep a log.</p>}
          {cpe.suggestions.length ? (
            <div>
              <p className="text-sm font-medium">From your Training & CPE work entries</p>
              <ul className="divide-y divide-line text-sm">
                {cpe.suggestions.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span>{formatDate(e.date)} · {hrs(e.minutes)} · {e.description || "Training & CPE"}</span>
                    <span className="flex gap-1">
                      <ActionButton action={confirmSuggestionAction.bind(null, e.id, true)}>Add (structured)</ActionButton>
                      <ActionButton action={confirmSuggestionAction.bind(null, e.id, false)} variant="ghost">Add (unstructured)</ActionButton>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {cpe.logs.length ? (
            <ul className="divide-y divide-line text-sm">
              {cpe.logs.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>{formatDate(l.date)} · {l.topic} · {hrs(l.minutes)}{l.structured ? "" : " (unstructured)"}{l.provider ? <span className="text-muted"> · {l.provider}</span> : null}</span>
                  <ActionButton action={deleteCpeAction.bind(null, l.id)} variant="ghost" confirm="Remove this CPE entry?">Remove</ActionButton>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No CPE logged yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>My skills</CardTitle><span className="text-xs text-muted">{Object.entries(SKILL_LEVELS).map(([k, v]) => `${k} ${v}`).join(" · ")}</span></CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {skills.map((sk) => <li key={sk.id} className="flex items-center justify-between gap-2 text-sm"><span>{sk.name}</span><SkillLevel userId={actor.userId} skillId={sk.id} level={sk.level} editable label={sk.name} /></li>)}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Training</CardTitle></CardHeader>
        <CardContent>
          {training.length === 0 ? <p className="text-sm text-muted">No sessions.</p> : (
            <ul className="divide-y divide-line text-sm">
              {training.map((t) => <li key={t.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{formatDate(t.date)} · {t.title}{t.trainer ? ` · ${t.trainer}` : ""}</span>{t.date > today ? <Badge tone="blue">Upcoming</Badge> : t.iAttended ? <Badge tone="green">Attended</Badge> : null}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>My HR letters</CardTitle></CardHeader>
        <CardContent>
          {letters.length === 0 ? <p className="text-sm text-muted">None issued.</p> : (
            <ul className="divide-y divide-line text-sm">
              {letters.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>{LETTER_LABELS[l.kind as LetterKind] ?? l.kind} · {formatDateTime(l.issuedAt)}</span>
                  <span className="flex gap-1"><a href={`/api/hr/download/letter/${l.id}?format=pdf`} className={buttonVariants({ size: "sm", variant: "secondary" })}>PDF</a><a href={`/api/hr/download/letter/${l.id}?format=docx`} className={buttonVariants({ size: "sm", variant: "ghost" })}>Word</a></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Firm assets with me</CardTitle></CardHeader>
        <CardContent>
          {assets.length === 0 ? <p className="text-sm text-muted">None.</p> : <ul className="text-sm">{assets.map((a) => <li key={a.assignmentId}>{a.tag} · {a.kind.toLowerCase()} {a.description ? `· ${a.description}` : ""} · since {formatDate(a.issuedAt)}</li>)}</ul>}
        </CardContent>
      </Card>

      <Card id="policies">
        <CardHeader><CardTitle>Policies</CardTitle></CardHeader>
        <CardContent>
          {policies.length === 0 ? <p className="text-sm text-muted">No policies published.</p> : (
            <ul className="divide-y divide-line">
              {policies.map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{p.title} <span className="font-normal text-muted">· {POLICY_LABELS[p.kind as keyof typeof POLICY_LABELS] ?? p.kind} · v{p.version}</span></span>
                      {p.outstanding ? <Badge tone="amber">Please acknowledge</Badge> : p.acknowledgedAt ? <Badge tone="green">Acknowledged {formatDateTime(p.acknowledgedAt)}</Badge> : null}
                    </summary>
                    <p className="mt-2 whitespace-pre-line">{p.body}</p>
                    {p.outstanding ? <div className="mt-2"><ActionButton action={acknowledgeAction.bind(null, p.id)} variant="default">I have read and accept this policy</ActionButton></div> : null}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
