import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { formatDate, todayIst } from "@/server/lib/dates";
import { CYCLE_LABELS, listCycles, listReviews, RATING_LABELS, REVIEW_LABELS, type CycleStatus } from "@/server/services/hr/appraisals";
import { isHrOrPartner } from "@/server/services/hr/common";
import { PageHeader, Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "../../work/action-button";
import { NewCycleDialog } from "./ui";
import { advanceCycleAction } from "./actions";

export const metadata = { title: "Appraisals" };

export default async function AppraisalsPage() {
  const actor = await requireStaff();
  const [cycles, reviews] = await Promise.all([load(() => listCycles(actor)), load(() => listReviews(actor))]);
  const admin = isHrOrPartner(actor);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Appraisals"
        subtitle="Goals at the start, self-review, Manager review, Partner moderation. Evidence comes from the system; hours are context, never a score."
        actions={<>{admin ? <NewCycleDialog today={todayIst()} /> : null}<Link href="/hr/appraisals/growth" className={buttonVariants({ size: "sm", variant: "secondary" })}>CPE, training & skills</Link></>}
      />
      {cycles.length === 0 ? <EmptyState title="No appraisal cycles yet" /> : null}
      {cycles.map((c) => {
        const rows = reviews.filter((r) => r.cycleId === c.id);
        const next = c.status !== "CLOSED";
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle>{c.name} <span className="font-normal text-muted">· {formatDate(c.startDate)} – {formatDate(c.endDate)}</span></CardTitle>
              <span className="flex items-center gap-2">
                <Badge tone={c.status === "CLOSED" ? "neutral" : "blue"}>{CYCLE_LABELS[c.status as CycleStatus]}</Badge>
                {admin && next ? <ActionButton action={advanceCycleAction.bind(null, c.id)} confirm="Move this cycle to its next phase?">Next phase</ActionButton> : null}
              </span>
            </CardHeader>
            {rows.length === 0 ? <p className="p-4 text-sm text-muted">No reviews visible to you.</p> : (
              <Table>
                <THead><tr><TH>Person</TH><TH>Manager</TH><TH>Goals</TH><TH>Status</TH><TH>Rating</TH></tr></THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.id}>
                      <TD><Link href={`/hr/appraisals/${r.id}`} className="font-medium text-brand hover:underline">{r.name}</Link></TD>
                      <TD>{r.manager}</TD>
                      <TD>{r.goalCount}</TD>
                      <TD><Badge tone={r.status === "FINAL" ? "green" : "neutral"}>{REVIEW_LABELS[r.status] ?? r.status}</Badge></TD>
                      <TD>{r.finalRating ? RATING_LABELS[r.finalRating] : r.managerRating ? `${RATING_LABELS[r.managerRating]} (Manager)` : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        );
      })}
    </div>
  );
}
