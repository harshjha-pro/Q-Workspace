import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { listJobs } from "@/server/scheduler";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/server/lib/dates";
import { RunNow } from "./run-now";

export const metadata = { title: "Scheduled jobs" };

export default async function JobsPage() {
  const actor = await requireStaff();
  requireCap(actor, "jobs.runNow");
  const jobs = await listJobs(actor);
  return (
    <div className="space-y-4">
      <PageHeader title="Scheduled jobs" subtitle="Run inside the app (no external queue). If the computer was off at the scheduled time, the job runs when the app next starts." />
      {jobs.map((j) => (
        <Card key={j.code}>
          <CardHeader><CardTitle>{j.name}</CardTitle><span className="flex items-center gap-2 text-xs text-muted">{j.schedule}<RunNow code={j.code} /></span></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted">{j.description}</p>
            {j.lastRuns.map((r) => (
              <p key={r.id} className="text-xs">
                {formatDateTime(r.startedAt)} · {r.trigger.toLowerCase()} · <Badge tone={r.status === "SUCCESS" ? "green" : r.status === "FAILED" ? "red" : "amber"}>{r.status.toLowerCase()}</Badge> {r.error ? <span className="text-red-700">{r.error}</span> : <span className="text-muted">{r.summaryJson}</span>}
              </p>
            ))}
            {j.lastRuns.length === 0 ? <p className="text-xs text-muted">Not run yet.</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
