import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { getExit, EXIT_LABELS, EXIT_STATUSES, type ExitStatus } from "@/server/services/hr/exits";
import { LETTER_LABELS, type LetterKind } from "@/server/services/hr/letters";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ActionButton } from "../../../work/action-button";
import { DatesDialog, ExitLetterDialog, FnfDialog, InstituteDialog } from "../ui";
import { advanceAction, refreshAction, toggleItemAction } from "../actions";

export const metadata = { title: "Exit" };

export default async function ExitPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "exit.manage");
  const { id } = await params;
  const d = await load(() => getExit(actor, id));
  const e = d.exit;
  const status = e.status as ExitStatus;
  const next = EXIT_STATUSES[EXIT_STATUSES.indexOf(status) + 1];
  const w = d.canWrite && status !== "CLOSED";
  const isArticle = d.user?.role === "ARTICLE";
  const f = d.fnf;
  const line = (label: string, paise: number, sign = "") => <div className="flex justify-between"><dt>{label}</dt><dd>{sign}{formatInr(paise)}</dd></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-sm"><Link href="/hr/exits" className="text-brand hover:underline">← Exits</Link></p>
      <PageHeader
        title={`Exit: ${d.user?.displayName ?? ""}`}
        subtitle={<>Resigned {formatDate(e.resignationDate)} · notice {e.noticeDays} days · last day {formatDate(e.lastWorkingDate)} <Badge tone="blue">{EXIT_LABELS[status]}</Badge></>}
        actions={w ? (
          <>
            <DatesDialog id={e.id} lwd={e.lastWorkingDate ?? ""} noticeDays={e.noticeDays} />
            {next ? <ActionButton action={advanceAction.bind(null, e.id)} variant="default" confirm={`Move to ${EXIT_LABELS[next]}?`}>{`Move to ${EXIT_LABELS[next]}`}</ActionButton> : null}
          </>
        ) : null}
      />
      {status === "CLOSED" ? <Alert>Exit closed. Deactivate the login under <Link className="underline" href={`/people/${e.userId}`}>People</Link> on the last working day if not done.</Alert> : null}

      <Card>
        <CardHeader><CardTitle>Handover checklist</CardTitle>{w ? <ActionButton action={refreshAction.bind(null, e.id)}>Refresh from custody</ActionButton> : null}</CardHeader>
        <CardContent>
          <ul className="divide-y divide-line">
            {e.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className={i.done ? "text-muted line-through" : ""}>{i.label}</span>
                {w ? <ActionButton action={toggleItemAction.bind(null, i.id, !i.done, e.id)} variant={i.done ? "ghost" : "secondary"}>{i.done ? "Reopen" : "Mark done"}</ActionButton> : i.done ? <Badge tone="green">Done</Badge> : <Badge tone="amber">Open</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Custody items (tasks, DSCs, documents, assets, vault access, teams) tick themselves once returned or reassigned in their registers. Client names are not shown here.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Full and final</CardTitle>{w && d.seesMoney ? <FnfDialog id={e.id} encash={d.hasEncashPolicy} /> : null}</CardHeader>
        <CardContent className="text-sm">
          {f ? (
            <dl className="max-w-md space-y-1">
              <div className="flex justify-between text-muted"><dt>Monthly gross / per day</dt><dd>{formatInr(f.input.monthlyGrossPaise)} / {formatInr(f.perDayPaise)} ({f.daysInMonth} days)</dd></div>
              {line(`Unpaid salary (${f.input.unpaidDays} days)`, f.salaryPaise)}
              {line(`Leave encashment (${f.encashmentAllowed ? f.input.leaveEncashDays : 0} days)`, f.encashmentPaise)}
              {line("Other earnings", f.input.otherEarningsPaise)}
              {line(`Notice shortfall (${f.noticeShortfallDays} days)${f.input.waiveNoticeRecovery ? ", waived" : ""}`, f.noticeRecoveryPaise, "−")}
              {line("Asset recovery", f.input.assetRecoveryPaise, "−")}
              {line("Advances", f.input.advancesPaise, "−")}
              {line("Other deductions", f.input.otherDeductionsPaise, "−")}
              <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>{f.netPaise >= 0 ? "Payable to employee" : "Recoverable from employee"}</dt><dd>{formatInr(Math.abs(f.netPaise))}</dd></div>
              <p className="pt-1 text-xs text-muted">Computed {formatDateTime(new Date(f.computedAt))}{f.input.notes ? ` · ${f.input.notes}` : ""}</p>
            </dl>
          ) : d.fnfComputed ? <p className="text-muted">Computed (amounts visible to Partners and HR only).</p> : <p className="text-muted">Not computed yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Letters{isArticle ? " and institute" : ""}</CardTitle>
          {w && d.seesMoney ? <span className="flex flex-wrap gap-1"><ExitLetterDialog id={e.id} kind="RELIEVING" label="Relieving letter" /><ExitLetterDialog id={e.id} kind="EXPERIENCE" label="Experience letter" />{isArticle ? <InstituteDialog id={e.id} today={todayIst()} /> : null}</span> : null}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {d.letters.length === 0 ? <p className="text-muted">No letters yet.</p> : (
            <ul className="divide-y divide-line">
              {d.letters.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>{LETTER_LABELS[l.kind as LetterKind]} · {formatDateTime(l.createdAt)}{l.issuedAt ? "" : " · not yet issued"}</span>
                  {d.seesMoney ? <span className="flex gap-1"><a className={buttonVariants({ size: "sm", variant: "secondary" })} href={`/api/hr/download/letter/${l.id}?format=pdf`}>PDF</a><a className={buttonVariants({ size: "sm", variant: "ghost" })} href={`/api/hr/download/letter/${l.id}?format=docx`}>Word</a></span> : null}
                </li>
              ))}
            </ul>
          )}
          {isArticle ? <p><span className="text-muted">Institute: </span>{e.instituteClosureNote || "not recorded yet"}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
