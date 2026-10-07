import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDate } from "@/server/lib/dates";
import { articlesWithoutRecord, listArticleship } from "@/server/services/hr/articleship";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { peopleOptions } from "../../registers/_lib/pickers";
import { RecordDialog } from "./ui";

export const metadata = { title: "Articleship" };

export default async function ArticleshipPage() {
  const actor = await requireStaff();
  requireCap(actor, "articleship.view");
  const { rows, rules } = await load(() => listArticleship(actor));
  const canEdit = can(actor, "hr.records.manage") || actor.role === "PARTNER";
  const [missing, partners] = canEdit ? await Promise.all([can(actor, "hr.records.manage") ? articlesWithoutRecord(actor) : Promise.resolve([]), peopleOptions(["PARTNER"])]) : [[], []];
  const approaching = rows.filter((r) => r.completionApproaching);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Articleship" subtitle={`Registration, leave against entitlement, exposure and completion. Completion within ${rules.completionAlertDays} days is flagged for replacement planning.`} />
      {approaching.length ? <Alert tone="warn">{approaching.length} article{approaching.length === 1 ? "" : "s"} complete within {rules.completionAlertDays} days: {approaching.map((r) => r.name).join(", ")}.</Alert> : null}
      {rows.length === 0 ? <EmptyState title="No articleship records">HR registers each article's institute details here.</EmptyState> : (
        <Card>
          <Table>
            <THead><tr><TH>Article</TH><TH>Principal</TH><TH>Leave</TH><TH>Completion</TH></tr></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/hr/articleship/${r.userId}`} className="font-medium text-brand hover:underline">{r.name}</Link><div className="text-xs text-muted">{r.institute} · {r.registrationNo}</div></TD>
                  <TD>{r.principal}</TD>
                  <TD>{r.takenHalfDays / 2} / {r.leaveEntitledDays} days {r.excessLeave ? <Badge tone="red">Excess</Badge> : null}</TD>
                  <TD>
                    {formatDate(r.revisedEndDate)}
                    {r.status !== "ACTIVE" ? <Badge className="ml-1">{r.status.toLowerCase()}</Badge> : r.completionApproaching ? <Badge tone="amber" className="ml-1">in {Math.max(0, r.daysToCompletion)} days</Badge> : null}
                    {r.revisedEndDate !== r.expectedEndDate ? <div className="text-xs text-muted">was {formatDate(r.expectedEndDate)}</div> : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {missing.length ? (
        <Card>
          <CardHeader><CardTitle>Articles without a registration record</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {missing.map((m) => <li key={m.id} className="flex items-center justify-between py-2 text-sm"><span>{m.displayName}</span><RecordDialog userId={m.id} partners={partners} trigger="Register" /></li>)}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
