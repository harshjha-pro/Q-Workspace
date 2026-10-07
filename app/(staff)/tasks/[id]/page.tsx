import { Comments } from "@/components/comments/comments";
import Link from "next/link";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getTask } from "@/server/services/tasks/service";
import { pendingMessage } from "@/server/services/pending/service";
import { listUserOptions } from "@/server/services/users/service";
import { can } from "@/server/permissions/guards";
import { load, requireCap } from "@/lib/page";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SERVICE_LINE_LABELS, type ServiceLine } from "@/server/domain/enums";
import { formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { formatInr, formatMinutes } from "@/server/lib/money";
import { DueDate, OPEN_STATUSES, TaskStatusBadge, TASK_STATUS_LABELS } from "../task-bits";
import {
  MoveStageDialog, SubmitForReviewDialog, RecordFilingDialog, NotApplicableDialog, AmendmentDialog, TaxDueDialog, ManualDueDialog,
  ReviewDecision, RespondPointDialog, ClearPointButton, RaisePointDialog, SignOffDialog,
  AddChecklistItemDialog, MarkAllRequestedButton, SetPendingDialog, ClearPendingDialog,
} from "./dialogs";
import { ChecklistStatus, ConfirmUploadButton, PendingMessage } from "./checklist-controls";

export const metadata = { title: "Task" };

const DISPLAY_LABEL: Record<string, { label: string; className: string }> = {
  OVERDUE: { label: "Overdue", className: "bg-red-50 text-st-overdue" },
  DUE_TODAY: { label: "Due today", className: "bg-amber-50 text-st-risk" },
  AT_RISK: { label: "At risk", className: "bg-amber-50 text-st-risk" },
};

const ITEM_TONE: Record<string, "neutral" | "amber" | "green"> = { NOT_REQUESTED: "neutral", REQUESTED: "amber", RECEIVED: "green", NOT_APPLICABLE: "neutral" };
const DUE_SOURCE: Record<string, string> = {
  GENERATION: "Generated from the due-date master", EXTENSION: "Extension", EVENT_CORRECTION: "Event date corrected", HOLIDAY_SHIFT: "Holiday shift",
  MASTER_UPDATE: "Master updated", MANUAL_ENTRY: "Entered manually",
};

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  requireCap(actor, "task.view");
  const t = await load(() => getTask(actor, id));
  const today = todayIst();
  const isOpen = OPEN_STATUSES.includes(t.status);
  const canWork = can(actor, "task.work") && isOpen;
  const canCheck = can(actor, "review.check");
  const msg = isOpen ? await pendingMessage(actor, id) : null;
  // Names for history rows; the detail payload only names hours, reviews and sign-offs.
  const people = new Map((await listUserOptions(actor)).map((u) => [u.id, u.displayName]));
  const who = (uid: string | null | undefined) => (uid ? people.get(uid) ?? "former staff" : "System");

  const stages = t.stageTemplateVersion?.stages ?? [];
  const current = stages[t.stageIndex];
  const done = new Set(t.stages.filter((s) => s.completedAt).map((s) => s.stageIndex));
  const isMakerHere = t.assignments.some((a) => a.user.id === actor.userId && (a.role === "MAKER" || a.role === "ASSIGNEE"));
  const openPending = t.pending.find((p) => !p.clearedAt);
  const itemLabel = new Map(t.checklist.map((i) => [i.id, i.label]));
  const totalMinutes = t.hours.reduce((a, h) => a + h.minutes, 0);
  // The service only lets non-master-managers set a date while the task has none from the master.
  const manualDue = !t.originalDueDate || can(actor, "dueDateMaster.manage");
  const eqrPossible = Boolean(t.engagement?.eqrRequired || t.family?.code === "F4");
  const named = (role: string) => t.assignments.filter((a) => a.role === role).map((a) => a.user.displayName);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/clients/${t.client.id}`} className="underline">{t.client.name}</Link>
            {t.periodLabel ? <span>{t.periodLabel}</span> : null}
            <TaskStatusBadge status={t.status} />
            {DISPLAY_LABEL[t.display] ? <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", DISPLAY_LABEL[t.display]!.className)}>{DISPLAY_LABEL[t.display]!.label}</span> : null}
            {t.engagement ? <Badge tone="brand">{SERVICE_LINE_LABELS[t.engagement.serviceLine as ServiceLine] ?? t.engagement.serviceLine}</Badge> : null}
            {t.isOneOff ? <Badge>one-off</Badge> : null}
          </span>
        }
        actions={canWork ? <Link href="/work" className={buttonVariants({ variant: "secondary", size: "sm" })}>Add work</Link> : null}
      />

      {t.dscWarnings.length ? (
        <Alert tone="warn"><p className="font-medium">DSC needed for this stage</p><ul className="mt-1 list-disc pl-5">{t.dscWarnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Due date, exposure, people */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Due date</CardTitle>{canWork && manualDue && can(actor, "task.notApplicable") ? <ManualDueDialog taskId={t.id} current={t.effectiveDueDate ?? ""} /> : null}</CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-base"><DueDate date={t.effectiveDueDate} status={t.status} today={today} provisional={t.isProvisional} holidayShifted={t.holidayShifted} /></p>
            {t.originalDueDate && t.originalDueDate !== t.effectiveDueDate ? <p className="text-muted">Statutory due date {formatDate(t.originalDueDate)}; current date reflects an extension or shift.</p> : null}
            {t.dueBasis ? <p className="text-muted">{t.dueBasis}</p> : null}
            {t.type ? <p className="text-muted">{t.type.name}{t.type.appliesWhen ? ` · applies when ${t.type.appliesWhen}` : ""}</p> : null}
            {t.exposure.daysLate > 0 && (t.exposure.rate || t.taxDuePaise) ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
                <p className="font-medium">{t.exposure.daysLate} day{t.exposure.daysLate === 1 ? "" : "s"} late{isOpen ? " so far" : ""}</p>
                <p>Late fee: {formatInr(t.exposure.feePaise)}{t.exposure.rate?.maxPaise != null ? ` (capped at ${formatInr(t.exposure.rate.maxPaise)})` : ""}</p>
                <p>Interest: {t.taxDuePaise ? formatInr(t.exposure.interestPaise) : "add the tax due to estimate"}{t.taxDuePaise ? ` on tax due of ${formatInr(t.taxDuePaise)}` : ""}</p>
                <p className="mt-1 text-xs">Estimate from the rates in the master; confirm on the portal before advising the client.</p>
              </div>
            ) : null}
            {t.exposure.rate && can(actor, "task.work") ? (
              <div className="flex items-center gap-2 text-muted">
                <span>Tax due: {t.taxDuePaise != null ? formatInr(t.taxDuePaise) : "not entered"}</span>
                <TaxDueDialog taskId={t.id} rupees={t.taxDuePaise != null ? t.taxDuePaise / 100 : null} />
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>People</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted">Maker:</span> {[...new Set([...named("MAKER"), ...named("ASSIGNEE")])].join(", ") || "Unassigned"}</p>
            <p><span className="text-muted">Checker:</span> {named("CHECKER").join(", ") || "None"}</p>
            {named("EQR").length ? <p><span className="text-muted">EQR:</span> {named("EQR").join(", ")}</p> : null}
            {t.engagement ? <p><span className="text-muted">Engagement:</span> <Link href={`/engagements/${t.engagement.id}`} className="underline">{t.engagement.name}</Link></p> : null}
            {t.gstin ? <p><span className="text-muted">GSTIN:</span> <span className="font-mono">{t.gstin.gstin}</span></p> : null}
            {t.director ? <p><span className="text-muted">Director:</span> {t.director.name} ({t.director.din})</p> : null}
          </CardContent>
        </Card>
      </div>

      {/* Stages (progress) */}
      <Card>
        <CardHeader>
          <CardTitle>Stages</CardTitle>
          <div className="flex flex-wrap gap-2">
            {canWork && current && current.reviewLevel !== "NONE" && !t.underReview && ["UPCOMING", "IN_PROGRESS"].includes(t.status) ? <SubmitForReviewDialog taskId={t.id} stage={current.name} level={current.reviewLevel} /> : null}
            {canWork && stages.length > 1 && !t.underReview ? (
              <MoveStageDialog taskId={t.id} current={t.stageIndex} stages={stages.map((s) => ({ index: s.index, name: s.name, note: [s.reviewLevel !== "NONE" ? `${s.reviewLevel.toLowerCase()} review` : "", s.isClientApproval ? "client approval" : "", s.isFiling ? "filing" : ""].filter(Boolean).join(", ") }))} />
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {stages.length === 0 ? <p className="text-sm text-muted">No stage template on this task.</p> : (
            <ol className="space-y-1.5 text-sm">
              {stages.map((s) => {
                const isCur = s.index === t.stageIndex && isOpen;
                const isDone = done.has(s.index) || (!isOpen && s.index <= t.stageIndex && t.status !== "NOT_APPLICABLE");
                return (
                  <li key={s.id} className={cn("flex flex-wrap items-center gap-2 rounded px-2 py-1", isCur && "bg-brand-50")}>
                    {isDone ? <CheckCircle2 className="h-4 w-4 text-st-filed" aria-label="done" /> : isCur ? <CircleDot className="h-4 w-4 text-st-progress" aria-label="current" /> : <Circle className="h-4 w-4 text-st-na" aria-label="not started" />}
                    <span className={cn(isCur && "font-medium")}>{s.index + 1}. {s.name}</span>
                    {s.reviewLevel !== "NONE" ? <span className="text-xs text-st-review">{s.reviewLevel.toLowerCase()} review</span> : null}
                    {s.isClientApproval ? <span className="text-xs text-st-pending">client approval</span> : null}
                    {s.isFiling ? <span className="text-xs text-st-filed">filing</span> : null}
                    {s.requiresDsc ? <span className="text-xs text-muted">DSC</span> : null}
                    {s.requiresUdin ? <span className="text-xs text-muted">UDIN</span> : null}
                    {isCur && t.underReview ? <Badge tone="violet">with checker{t.underReviewSince ? ` since ${formatDateTime(t.underReviewSince)}` : ""}</Badge> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
            {canWork ? <div className="flex flex-wrap gap-1"><AddChecklistItemDialog taskId={t.id} />{t.checklist.some((i) => i.status === "NOT_REQUESTED") ? <MarkAllRequestedButton taskId={t.id} /> : null}</div> : null}
          </CardHeader>
          <CardContent>
            {t.checklist.length === 0 ? <p className="text-sm text-muted">No checklist items yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {t.checklist.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p>{i.label}</p>
                      <p className="text-xs text-muted">
                        {i.requestedAt ? `Requested ${formatDate(i.requestedAt)}` : ""}{i.receivedAt ? ` · Received ${formatDate(i.receivedAt)}` : ""}{i.note ? ` · ${i.note}` : ""}
                      </p>
                      {i.receivedPendingConfirm ? <p className="text-xs text-st-pending">Uploaded on the portal, awaiting staff confirmation</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {canWork ? (
                        <>
                          {i.receivedPendingConfirm ? <ConfirmUploadButton taskId={t.id} itemId={i.id} /> : null}
                          <ChecklistStatus taskId={t.id} itemId={i.id} status={i.status} label={i.label} />
                        </>
                      ) : <Badge tone={ITEM_TONE[i.status]}>{i.status.toLowerCase().replace("_", " ")}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending from client — client delay kept apart from firm work */}
        <Card>
          <CardHeader>
            <CardTitle>Pending from client</CardTitle>
            {canWork ? (t.pendingFromClient ? <ClearPendingDialog taskId={t.id} /> : !t.underReview ? <SetPendingDialog taskId={t.id} items={t.checklist.map((i) => ({ id: i.id, label: i.label, status: i.status }))} /> : null) : null}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted">Client waiting: <span className="font-medium text-st-pending">{t.clientWaitingDays} day{t.clientWaitingDays === 1 ? "" : "s"}</span> in total. This is the client&apos;s delay, counted separately from the firm&apos;s.</p>
            {openPending ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="font-medium text-amber-900">Waiting since {formatDate(openPending.since)}: {openPending.what}</p>
                {openPending.items.length ? <ul className="mt-1 list-disc pl-5 text-amber-900">{openPending.items.map((pi) => <li key={pi.id}>{itemLabel.get(pi.checklistItemId) ?? "item"}</li>)}</ul> : null}
              </div>
            ) : <p>Not waiting on the client right now.</p>}
            {msg ? <PendingMessage taskId={t.id} text={msg.text} items={msg.items} channel={msg.channel} canLog={canWork} /> : null}
            {t.pending.filter((p) => p.clearedAt).length ? (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">Earlier waits</summary>
                <ul className="mt-1 space-y-0.5">{t.pending.filter((p) => p.clearedAt).map((p) => <li key={p.id}>{formatDate(p.since)} → {formatDateTime(p.clearedAt)}: {p.what}{p.clearedReason ? ` (${p.clearedReason})` : ""}</li>)}</ul>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Reminder log */}
      <Card>
        <CardHeader><CardTitle>Reminder log</CardTitle></CardHeader>
        <CardContent>
          {t.reminderLogs.length === 0 ? <p className="text-sm text-muted">No follow-ups logged.</p> : (
            <ul className="divide-y divide-line text-sm">
              {t.reminderLogs.map((r) => (
                <li key={r.id} className="py-1.5">
                  <span className="font-medium">{formatDateTime(r.sentAt)}</span> · {r.channel.toLowerCase()} · {who(r.sentById)}
                  {r.messageText ? <details className="text-xs text-muted"><summary className="cursor-pointer">Message</summary><pre className="whitespace-pre-wrap font-sans">{r.messageText}</pre></details> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Review */}
      <Card>
        <CardHeader><CardTitle>Review</CardTitle>{canCheck && isOpen && !isMakerHere ? <RaisePointDialog taskId={t.id} /> : null}</CardHeader>
        <CardContent className="space-y-4">
          {t.reviews.length === 0 ? <p className="text-sm text-muted">Not submitted for review yet.</p> : t.reviews.map((r) => (
            <div key={r.id} className="space-y-2 rounded-md border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  <span className="font-medium">{stages[r.stageIndex]?.name ?? `Stage ${r.stageIndex + 1}`}</span>
                  <span className="text-muted"> · {r.level.toLowerCase()} review · {r.makerName} → {r.checkerName || "unassigned"} · {formatDateTime(r.submittedAt)}</span>
                </p>
                <Badge tone={r.status === "APPROVED" ? "green" : r.status === "RETURNED" ? "amber" : r.status === "PENDING" ? "violet" : "neutral"}>{r.status.toLowerCase()}</Badge>
              </div>
              {r.note ? <p className="text-muted">{r.note}</p> : null}
              {r.points.length ? (
                <ul className="space-y-2">
                  {r.points.map((p) => (
                    <li key={p.id} className={cn("rounded border-l-2 pl-2", p.status === "OPEN" ? "border-st-pending" : "border-st-filed")}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p>{p.text}</p>
                        <div className="flex items-center gap-1">
                          {p.status === "OPEN" && can(actor, "task.work") ? <RespondPointDialog taskId={t.id} pointId={p.id} current={p.response} /> : null}
                          {p.status === "OPEN" && canCheck && r.makerId !== actor.userId && !isMakerHere ? <ClearPointButton taskId={t.id} pointId={p.id} /> : null}
                          <Badge tone={p.status === "OPEN" ? "amber" : "green"}>{p.status.toLowerCase()}</Badge>
                        </div>
                      </div>
                      {p.response ? <p className="text-xs text-ink"><span className="text-muted">Response:</span> {p.response}</p> : null}
                      <p className="text-xs text-muted">Raised by {who(p.raisedById)} on {formatDateTime(p.raisedAt)}{p.clearedAt ? ` · cleared by ${who(p.clearedById)} on ${formatDateTime(p.clearedAt)}` : ""}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {r.status === "PENDING" && canCheck && r.makerId !== actor.userId && !isMakerHere ? <ReviewDecision taskId={t.id} reviewId={r.id} /> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sign-off and UDIN */}
      {t.family?.requiresSignoff || t.family?.requiresUdin || t.signOffs.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Sign-off</CardTitle>
            <div className="flex flex-wrap gap-2">
              {eqrPossible && can(actor, "eqr.perform") && !t.signOffs.some((s) => s.level === "EQR") ? <SignOffDialog taskId={t.id} level="EQR" /> : null}
              {t.family?.requiresSignoff && can(actor, "signoff.final") && !t.signOffs.some((s) => s.level === "PARTNER") ? <SignOffDialog taskId={t.id} level="PARTNER" /> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {eqrPossible ? <p className="text-muted">Engagement quality review may be required before Partner sign-off.</p> : null}
            {t.signOffs.length === 0 ? <p className="text-muted">Not signed off yet.</p> : (
              <ul>{t.signOffs.map((s) => <li key={s.id}><Badge tone="green">{s.level.toLowerCase()}</Badge> {s.signedByName} · {formatDateTime(s.signedAt)}{s.note ? ` · ${s.note}` : ""}</li>)}</ul>
            )}
            {t.family?.requiresUdin ? (
              <p>
                <span className="text-muted">UDIN:</span>{" "}
                {t.udin?.udin ? <span className="font-mono">{t.udin.udin}</span> : t.udin ? <Badge tone="amber">awaiting UDIN</Badge> : <span className="text-muted">opens on Partner sign-off</span>}
                {" "}<Link href="/registers/udin" className="text-brand underline">UDIN register</Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Outcome */}
      <Card>
        <CardHeader>
          <CardTitle>Filing</CardTitle>
          <div className="flex flex-wrap gap-2">
            {isOpen && can(actor, "task.recordFiling") ? <RecordFilingDialog taskId={t.id} ackType={t.ackType ?? t.type?.ackType ?? "ACK"} today={today} /> : null}
            {isOpen && can(actor, "task.notApplicable") ? <NotApplicableDialog taskId={t.id} /> : null}
            {(t.status === "FILED" || t.status === "FILED_LATE") && can(actor, "task.bulk") ? <AmendmentDialog taskId={t.id} /> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {t.status === "NOT_APPLICABLE" ? <p>Not applicable: {t.notApplicableReason}</p> : null}
          {t.acknowledgments.length ? (
            <ul>{t.acknowledgments.map((a) => <li key={a.id}><span className="text-muted">{a.ackType.replace("_", " ")}</span> <span className="font-mono">{a.number}</span> · filed {formatDate(a.date)}</li>)}</ul>
          ) : t.status !== "NOT_APPLICABLE" ? <p className="text-muted">Not filed yet.</p> : null}
          {t.status === "FILED_LATE" ? <p className="text-st-late">Filed after the due date.</p> : null}
          {t.amendsTaskId ? <p><Link href={`/tasks/${t.amendsTaskId}`} className="text-brand underline">Original filing</Link></p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Effort — hours are never a progress measure */}
        <Card>
          <CardHeader><CardTitle>Hours logged</CardTitle><span className="text-xs text-muted">Effort, not progress</span></CardHeader>
          <CardContent className="text-sm">
            {t.hours.length === 0 ? <p className="text-muted">No time logged on this task.</p> : (
              <>
                <p className="mb-1 font-medium">{formatMinutes(totalMinutes)} logged</p>
                <ul className="space-y-0.5">{t.hours.map((h) => <li key={h.userId} className="flex justify-between"><span>{h.name}</span><span className="text-muted">{formatMinutes(h.minutes)}</span></li>)}</ul>
              </>
            )}
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader><CardTitle>History</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Status</p>
              <ul className="space-y-0.5">
                {t.statusHistory.map((h) => (
                  <li key={h.id}><span className="text-muted">{formatDateTime(h.changedAt)}</span> · {h.fromStatus ? `${TASK_STATUS_LABELS[h.fromStatus] ?? h.fromStatus} → ` : ""}{TASK_STATUS_LABELS[h.toStatus] ?? h.toStatus}{h.reason ? ` · ${h.reason}` : ""} <span className="text-muted">({who(h.createdById)})</span></li>
                ))}
              </ul>
            </div>
            {t.dueDateHistory.length ? (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Due date</p>
                <ul className="space-y-0.5">
                  {t.dueDateHistory.map((h) => (
                    <li key={h.id}><span className="text-muted">{formatDateTime(h.changedAt)}</span> · {h.oldValue ? `${formatDate(h.oldValue)} → ` : ""}{formatDate(h.newValue)} · {DUE_SOURCE[h.source] ?? h.source}{h.reference ? ` (${h.reference})` : ""}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <Comments entityType="TASK" entityId={id} />
    </div>
  );
}
