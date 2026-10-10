import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { peopleDashboard } from "@/server/services/analytics/people";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarList, KpiRow, StatTile } from "@/components/charts/charts";
import { PeriodPicker, hoursText, pctText } from "../_ui";

export const metadata = { title: "People dashboard" };

const LEAVE: Record<string, string> = { PERSONAL: "Personal", SICK: "Sick", EXAM_STUDY: "Exam / study", OTHER: "Other" };
const CATEGORY: Record<string, string> = { PARTNER: "Partners", STAFF: "Staff", ARTICLE: "Articles", ADMIN: "Admin", SUPPORT: "Support" };
const STAGE: Record<string, string> = { APPLIED: "Applied", SCREENING: "Screening", TEST: "Test", INTERVIEW: "Interview", OFFER: "Offer", JOINED: "Joined", REJECTED: "Rejected" };
const CYCLE: Record<string, string> = { GOAL_SETTING: "Goal setting", SELF_REVIEW: "Self review", MANAGER_REVIEW: "Manager review", MODERATION: "Moderation" };

export default async function PeopleDashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "analytics.hr")) redirect("/denied");
  const d = await peopleDashboard(actor, { period: (await searchParams).period });
  const h = d.headline;
  const a = d.appraisal;
  return (
    <div className="space-y-4">
      <PageHeader title="People" subtitle={`${d.period.label} · firm-level counts, no client data · Partners and HR`} actions={<PeriodPicker base="/analytics/people" current={d.period.key} />} />
      <KpiRow>
        <StatTile label="Headcount" value={String(h.headcount)} sub={`${h.joiners} joined · ${h.leavers} left in period`} href="/people" />
        <StatTile label="Attrition, 12 months" value={pctText(h.attritionPct)} sub={`${h.leavers12} leaver${h.leavers12 === 1 ? "" : "s"}`} />
        <StatTile label="Serving notice" value={String(h.onNotice)} href="/hr/exits" />
        <StatTile label="Open positions" value={String(h.openPositions)} href="/hr/recruitment" />
        <StatTile label="Leave requests pending" value={String(h.pendingLeave)} tone={h.pendingLeave ? "warn" : undefined} href="/leave" />
        <StatTile label="CPE shortfall this year" value={`${h.cpeShortfall} of ${h.cpeMembers}`} sub={`${hoursText(h.cpeHoursThisFy)} logged this FY`} tone={h.cpeShortfall ? "warn" : undefined} />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>By designation</CardTitle></CardHeader><CardContent>
          <BarList title="Active people by designation" rows={d.byDesignation.map((r) => ({ label: r.name, value: r.count }))} empty="No people." />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>By category</CardTitle></CardHeader><CardContent>
          <BarList title="Active people by employee category" rows={d.byCategory.map((r) => ({ label: CATEGORY[r.category] ?? r.category, value: r.count }))} empty="No people." />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Tenure</CardTitle></CardHeader><CardContent>
          <BarList title="Active people by length of service" rows={d.tenure.map((r) => ({ label: r.label, value: r.count }))} empty="No people." />
        </CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Leave taken in the period</CardTitle></CardHeader><CardContent>
          <BarList title="Approved leave days in the period by type" rows={d.leaveByType.map((r) => ({ label: LEAVE[r.type] ?? r.type, value: r.days, display: `${r.days} day${r.days === 1 ? "" : "s"}` }))} empty="No approved leave in this period." />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Recruitment</CardTitle></CardHeader><CardContent>
          <BarList title="Candidates by stage (open positions; joined and rejected all time)" rows={d.recruitment.map((r) => ({ label: STAGE[r.stage] ?? r.stage, value: r.count }))} empty="No candidates." />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Appraisals and articleship</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
          {a ? (
            <div>
              <div className="font-medium">{a.name} · {CYCLE[a.status] ?? a.status}</div>
              <ul className="mt-1 space-y-0.5 text-muted">
                <li>Self reviews submitted: <span className="tabular-nums text-ink">{a.selfDone} of {a.reviews}</span></li>
                <li>Manager reviews submitted: <span className="tabular-nums text-ink">{a.managerDone} of {a.reviews}</span></li>
                <li>Finalised: <span className="tabular-nums text-ink">{a.finalised} of {a.reviews}</span></li>
              </ul>
            </div>
          ) : <p className="text-muted">No appraisal cycle open.</p>}
          <div>
            <div className="font-medium">Articleship</div>
            <p className="text-muted"><span className="tabular-nums text-ink">{h.activeArticles}</span> active articles, <span className="tabular-nums text-ink">{h.articlesCompletingSoon}</span> completing soon.</p>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
