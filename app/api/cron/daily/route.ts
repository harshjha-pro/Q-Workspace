import { timingSafeEqual } from "node:crypto";
import { JOBS } from "@/server/scheduler/jobs";
import { dueOnDay } from "@/server/scheduler/due";
import { todayIst } from "@/server/lib/dates";

/**
 * Vercel Cron dispatcher (web deployment, D-99). The Hobby plan allows only daily cron runs, so one cron calls
 * this once a day (about 06:00 IST); it starts every job whose schedule falls on today (IST), each as its own
 * request to /api/cron/<JOB> with its own time limit. On Pro, jobs can get their own schedules in vercel.json.
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

export async function GET(req: Request) {
  if (!authorised(req)) return new Response("Unauthorized", { status: 401 });
  const origin = new URL(req.url).origin;
  const today = todayIst();
  const due = JOBS.filter((j) => dueOnDay(j.cron, today));
  const results = await Promise.allSettled(
    due.map(async (j) => {
      const r = await fetch(`${origin}/api/cron/${j.code}`, { headers: { authorization: req.headers.get("authorization")! }, cache: "no-store" });
      return { job: j.code, status: r.status, body: await r.text() };
    }),
  );
  return Response.json({ day: today, jobs: results.map((r, i) => (r.status === "fulfilled" ? r.value : { job: due[i]!.code, error: String(r.reason) })) });
}
