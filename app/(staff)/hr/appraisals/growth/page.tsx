import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { scopeOf } from "@/server/permissions/guards";
import { formatDate, todayIst } from "@/server/lib/dates";
import { cpeOverview, listTraining, skillMatrix, SKILL_LEVELS } from "@/server/services/hr/growth";
import { isHrOrPartner } from "@/server/services/hr/common";
import { SERVICE_LINES, SERVICE_LINE_LABELS, type ServiceLine } from "@/server/domain/enums";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { peopleOptions } from "../../../registers/_lib/pickers";
import { AddSkillDialog, AttendanceDialog, SkillLevel, TrainingDialog } from "../ui";

export const metadata = { title: "CPE, training & skills" };
const hrs = (m: number) => `${Math.round((m / 60) * 10) / 10} hrs`;

export default async function GrowthAdminPage({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const actor = await requireStaff();
  const scope = scopeOf(actor, "hr.records.view");
  if (scope === "none" || scope === "self") redirect("/denied");
  const line = (await searchParams).line;
  const serviceLine = SERVICE_LINES.includes(line as ServiceLine) ? line : undefined;
  const today = todayIst();
  const [cpe, training, matrix] = await Promise.all([load(() => cpeOverview(actor, today)), load(() => listTraining(actor)), load(() => skillMatrix(actor, { serviceLine }))]);
  const runsTraining = isHrOrPartner(actor) || actor.role === "MANAGER";
  const people = runsTraining ? await peopleOptions(["PARTNER", "MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN", "HR_ADMIN"]) : [];
  const lines = SERVICE_LINES.map((l) => [l, SERVICE_LINE_LABELS[l]] as [string, string]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <p className="text-sm"><Link href="/hr/appraisals" className="text-brand hover:underline">← Appraisals</Link></p>
      <PageHeader title="CPE, training & skills" subtitle="CPE of qualified members against the configured requirement, the internal training calendar and the skill matrix used for allocation." />

      <Card>
        <CardHeader><CardTitle>CPE status</CardTitle></CardHeader>
        {cpe.length === 0 ? <p className="p-4 text-sm text-muted">No qualified members (ICAI/ICSI membership on the employee record).</p> : (
          <Table>
            <THead><tr><TH>Member</TH><TH>Block</TH><TH>Done</TH><TH>Shortfall</TH></tr></THead>
            <TBody>
              {cpe.map((c) => (
                <TR key={c.userId}>
                  <TD>{c.name}<div className="text-xs text-muted">{c.institute}{c.requirement && !c.requirement.verified ? " · requirement unverified" : ""}</div></TD>
                  <TD>{c.block ? `${c.block.fromYear}–${c.block.toYear}` : "No requirement set"}<div className="text-xs text-muted">{c.block ? `${c.block.daysLeft} days left` : ""}</div></TD>
                  <TD>{hrs(c.completedMinutes)}<div className="text-xs text-muted">{hrs(c.structuredMinutes)} structured · {hrs(c.currentYearMinutes)} this year</div></TD>
                  <TD>{c.shortfall.totalMinutes || c.shortfall.yearMinutes || c.shortfall.structuredMinutes ? <Badge tone="amber">{hrs(c.shortfall.totalMinutes)} block · {hrs(c.shortfall.yearMinutes)} year</Badge> : <Badge tone="green">On track</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>Training calendar</CardTitle>{runsTraining ? <TrainingDialog today={today} /> : null}</CardHeader>
        {training.length === 0 ? <p className="p-4 text-sm text-muted">No sessions yet.</p> : (
          <Table>
            <THead><tr><TH>Session</TH><TH>Date</TH><TH>Attended</TH><TH /></tr></THead>
            <TBody>
              {training.map((t) => (
                <TR key={t.id}>
                  <TD>{t.title}<div className="text-xs text-muted">{t.trainer}{t.cpeEligible ? " · CPE eligible" : ""} · {hrs(t.minutes)}</div></TD>
                  <TD>{formatDate(t.date)}{t.date > today ? <Badge tone="blue" className="ml-1">upcoming</Badge> : null}</TD>
                  <TD>{t.attendees}</TD>
                  <TD>{runsTraining && t.date <= today ? <AttendanceDialog sessionId={t.id} people={people} attended={t.attendeeIds} /> : null}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skill matrix</CardTitle>
          <span className="flex flex-wrap items-center gap-1">
            {[["", "All"], ...lines].map(([k, v]) => (
              <Link key={k} href={k ? `/hr/appraisals/growth?line=${k}` : "/hr/appraisals/growth"} className={cn("rounded px-2 py-1 text-xs", (serviceLine ?? "") === k ? "bg-brand text-white" : "bg-gray-100 text-ink")}>{v}</Link>
            ))}
            {isHrOrPartner(actor) ? <AddSkillDialog lines={lines} /> : null}
          </span>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-muted">
              <tr><th className="sticky left-0 bg-gray-50 px-3 py-2">Person</th>{matrix.skills.map((s) => <th key={s.id} className="px-2 py-2 font-medium">{s.name}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {matrix.people.map((p) => (
                <tr key={p.userId}>
                  <td className="sticky left-0 bg-surface px-3 py-1.5 whitespace-nowrap">{p.name}</td>
                  {matrix.skills.map((s) => <td key={s.id} className="px-2 py-1.5"><SkillLevel userId={p.userId} skillId={s.id} level={p.levels[s.id] ?? 0} editable label={`${p.name}: ${s.name}`} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-muted">Levels: {Object.entries(SKILL_LEVELS).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
