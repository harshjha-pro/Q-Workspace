import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser, actorOf } from "../helpers/factory";
import { runJob, listJobs } from "@/server/scheduler";

beforeAll(resetDb);

describe("scheduler (Run now + JobRun log)", () => {
  it("runs a job manually and records the run", async () => {
    const pa = await makeUser("PRACTICE_ADMIN");
    const run = await runJob("SESSION_CLEANUP", "MANUAL", actorOf(pa));
    expect(run?.status).toBe("SUCCESS");
    const jobs = await listJobs(actorOf(pa));
    expect(jobs.find((j) => j.code === "SESSION_CLEANUP")!.lastRuns).toHaveLength(1);
  });
  it("Staff cannot run jobs; HR cannot run firm jobs", async () => {
    const s = await makeUser("STAFF");
    await expect(runJob("SESSION_CLEANUP", "MANUAL", actorOf(s))).rejects.toThrow(/access/);
    const hr = await makeUser("HR_ADMIN");
    await expect(runJob("AUTO_BACKUP", "MANUAL", actorOf(hr))).rejects.toThrow(/access/);
  });
});
