import cron from "node-cron";
import { db } from "../lib/db";
import { logger } from "../lib/logger";
import type { Actor } from "../permissions/actor";
import { authorize } from "../permissions/guards";
import { forbidden, notFound } from "../lib/errors";
import { JOBS, type JobDef } from "./jobs";

/**
 * In-process scheduler (node-cron) — replaces Redis/queues (brief §4). Every job is idempotent,
 * logged to JobRun and has a "Run now" button. On boot, any job whose last success is older than
 * its interval runs once, so a laptop that slept through 23:30 still gets its backup.
 */
const g = globalThis as unknown as { __qepexScheduler?: boolean; __qepexRunning?: Set<string> };
const running = (g.__qepexRunning ??= new Set<string>());

export async function runJob(code: string, trigger: "CRON" | "MANUAL" | "BOOT", actor?: Actor) {
  const job = JOBS.find((j) => j.code === code);
  if (!job) throw notFound("Job");
  if (actor) {
    authorize(actor, "jobs.runNow");
    if (actor.kind === "USER" && !job.roles.includes(actor.role)) throw forbidden();
  }
  if (running.has(code)) return null; // never overlap the same job
  running.add(code);
  const run = await db().jobRun.create({ data: { jobCode: code, trigger, triggeredById: actor && actor.kind !== "PORTAL" ? actor.userId : null } });
  try {
    const summary = await job.run();
    await db().jobRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), summaryJson: JSON.stringify(summary ?? {}) } });
    logger().info({ job: code, trigger, summary }, "job finished");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db().jobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 2000) } });
    logger().error({ job: code, trigger, err: message }, "job failed");
  } finally {
    running.delete(code);
  }
  return db().jobRun.findUnique({ where: { id: run.id } });
}

export async function listJobs(actor: Actor) {
  authorize(actor, "jobs.runNow");
  const visible = JOBS.filter((j) => actor.kind !== "USER" || j.roles.includes(actor.role));
  return Promise.all(
    visible.map(async (j) => ({
      code: j.code, name: j.name, description: j.description, schedule: j.scheduleLabel,
      lastRuns: await db().jobRun.findMany({ where: { jobCode: j.code }, orderBy: { startedAt: "desc" }, take: 5 }),
    })),
  );
}

async function catchUp(job: JobDef) {
  const last = await db().jobRun.findFirst({ where: { jobCode: job.code, status: "SUCCESS" }, orderBy: { startedAt: "desc" } });
  if (!last || Date.now() - last.startedAt.getTime() > job.catchUpAfterHours * 3600_000) await runJob(job.code, "BOOT");
}

export function startScheduler() {
  if (g.__qepexScheduler || process.env.NODE_ENV === "test" || process.env.DISABLE_SCHEDULER === "true") return;
  g.__qepexScheduler = true;
  for (const job of JOBS) {
    cron.schedule(job.cron, () => void runJob(job.code, "CRON"), { timezone: "Asia/Kolkata" });
  }
  // Give the server a moment to finish starting before catch-up work.
  setTimeout(() => {
    void (async () => {
      for (const job of JOBS) await catchUp(job).catch((e) => logger().error({ job: job.code, err: String(e) }, "catch-up failed"));
    })();
  }, 15_000);
  logger().info({ jobs: JOBS.map((j) => j.code) }, "scheduler started");
}
