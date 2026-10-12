import { timingSafeEqual } from "node:crypto";
import { runJob } from "@/server/scheduler";
import { JOBS } from "@/server/scheduler/jobs";

/**
 * Vercel Cron entry point (web deployment, D-99): GET /api/cron/<JOB_CODE>. Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; anything else is refused. Jobs are the same idempotent jobs the office
 * install runs in-process, logged to JobRun like any other run.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorised(req)) return new Response("Unauthorized", { status: 401 });
  const { job } = await params;
  if (!JOBS.some((j) => j.code === job)) return new Response("Unknown job", { status: 404 });
  const run = await runJob(job, "CRON");
  return Response.json({ job, status: run?.status ?? "SKIPPED (already running)" });
}
