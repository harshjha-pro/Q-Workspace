import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { todayIst, addDays } from "@/server/lib/dates";
import { seedCollabReference } from "@/prisma/seed/phase3/collab";
import * as applause from "@/server/services/applause/service";
import { giveApplause, myApplause, applauseFor } from "@/server/services/applause/service";
import {
  raiseTicket, listQueue, getTicket, replyToTicket, assignTicket, setTicketStatus, convertToFaq, myTickets, ticketScreenshot,
} from "@/server/services/helpdesk/service";

let w: Awaited<ReturnType<typeof buildWorld>>;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await seedCollabReference(db());
});

describe("applause and badges (P3-04, spec 7.3)", () => {
  it("seeds the six badges", async () => {
    expect((await db().badge.findMany()).map((b) => b.code).sort()).toEqual(["CLEAN_REVIEW", "CLIENT_CHAMPION", "DEADLINE_HERO", "FAST_LEARNER", "PROBLEM_SOLVER", "TEAM_PLAYER"]);
  });

  it("Partners applaud anyone, Managers only their team; the recipient is notified", async () => {
    await giveApplause(actorOf(w.partner), { toUserId: w.s1.id, badgeCode: "DEADLINE_HERO", message: "Filed the batch two days early." });
    await giveApplause(actorOf(w.m1), { toUserId: w.s1.id, badgeCode: "CLEAN_REVIEW", message: "No review points at all." });
    await giveApplause(actorOf(w.partner), { toUserId: w.s2.id, badgeCode: "TEAM_PLAYER", message: "Helped the other team." });
    await expect(giveApplause(actorOf(w.m1), { toUserId: w.s2.id, badgeCode: "TEAM_PLAYER", message: "Not my team member." })).rejects.toThrow();
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "APPLAUSE" } })).toBe(2);
  });

  it("Staff, Articles, Practice Admin and HR Admin cannot send applause; no self-applause; badge required", async () => {
    for (const u of [w.s1, w.senior, w.a1, w.pa, w.hr]) {
      await expect(giveApplause(actorOf(u), { toUserId: w.s2.id, badgeCode: "TEAM_PLAYER", message: "Great work there." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(giveApplause(actorOf(w.partner), { toUserId: w.partner.id, badgeCode: "TEAM_PLAYER", message: "Me, myself." })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    await expect(giveApplause(actorOf(w.partner), { toUserId: w.s1.id, badgeCode: "NOPE" as never, message: "Bad badge here." })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("is immutable and has no ranking API: no edit / revoke / delete / leaderboard / count functions exist", () => {
    const names = Object.keys(applause);
    expect(names.filter((n) => /edit|update|revoke|delete|remove|withdraw|leader|rank|top|count|score/i.test(n))).toEqual([]);
  });

  it("the recipient sees their applause; appraisal evidence lists entries for a window", async () => {
    const mine = await myApplause(actorOf(w.s1));
    expect(mine.received).toHaveLength(2);
    expect(mine.received.every((r) => r.badgeName)).toBe(true);
    expect((await myApplause(actorOf(w.partner))).sent).toHaveLength(2);
    const t = todayIst();
    const ev = await applauseFor(w.s1.id, addDays(t, -30), t);
    expect(ev.map((e) => e.badgeCode).sort()).toEqual(["CLEAN_REVIEW", "DEADLINE_HERO"]);
    expect(await applauseFor(w.s1.id, addDays(t, -60), addDays(t, -31))).toHaveLength(0);
  });
});

describe("helpdesk (P3-05, spec 9.1)", () => {
  let bugId = "";
  let hrId = "";

  it("raises tickets into the right queue and notifies the handlers", async () => {
    const bug = await raiseTicket(actorOf(w.s1), { category: "BUG", subject: "Calendar is blank", description: "My calendar shows nothing for this week." });
    bugId = bug.id;
    expect(bug.queue).toBe("ADMIN");
    expect(await db().notification.count({ where: { userId: w.pa.id, kind: "HELPDESK" } })).toBe(1);
    expect(await db().notification.count({ where: { userId: w.hr.id, kind: "HELPDESK" } })).toBe(0);
    await expect(raiseTicket(actorOf(w.a1), { category: "HR_QUERY", subject: "Payslip question", description: "Stipend is missing this month." })).rejects.toMatchObject({ code: "VALIDATION" });
    const hrq = await raiseTicket(actorOf(w.a1), { category: "HR_QUERY", hrTopic: "PAYSLIP", subject: "Payslip question", description: "Stipend is missing this month." });
    hrId = hrq.id;
    expect(hrq.queue).toBe("HR");
    expect(bug.number + 1).toBe(hrq.number);
  });

  it("routes HR queries to HR Admin only; admin queue to Practice Admin; Partner sees both", async () => {
    expect((await listQueue(actorOf(w.pa))).map((t) => t.id)).toEqual([bugId]);
    expect((await listQueue(actorOf(w.hr))).map((t) => t.id)).toEqual([hrId]);
    expect((await listQueue(actorOf(w.partner))).map((t) => t.id).sort()).toEqual([bugId, hrId].sort());
    for (const u of [w.s1, w.m1, w.a1]) await expect(listQueue(actorOf(u))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getTicket(actorOf(w.hr), bugId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getTicket(actorOf(w.pa), hrId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getTicket(actorOf(w.s2), bugId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("internal notes are hidden from the raiser; only handlers add them", async () => {
    await replyToTicket(actorOf(w.pa), bugId, { body: "Probably the personal layer filter.", internal: true });
    await replyToTicket(actorOf(w.pa), bugId, { body: "Can you try the compliance layer?" });
    await expect(replyToTicket(actorOf(w.s1), bugId, { body: "sneaky", internal: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const seenByRaiser = await getTicket(actorOf(w.s1), bugId);
    expect(seenByRaiser.replies.map((r) => r.body)).toEqual(["Can you try the compliance layer?"]);
    expect(seenByRaiser.status).toBe("IN_PROGRESS");
    expect((await getTicket(actorOf(w.pa), bugId)).replies).toHaveLength(2);
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "HELPDESK" } })).toBe(1);
  });

  it("assigns only to handlers of the queue", async () => {
    await expect(assignTicket(actorOf(w.pa), bugId, w.hr.id)).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    await assignTicket(actorOf(w.pa), bugId, w.pa.id);
    await expect(assignTicket(actorOf(w.s1), bugId, w.pa.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await assignTicket(actorOf(w.hr), hrId, w.hr.id);
    expect((await db().helpdeskTicket.findUniqueOrThrow({ where: { id: hrId } })).status).toBe("IN_PROGRESS");
  });

  it("Open → In Progress → Resolved → Closed, and reopen", async () => {
    await expect(setTicketStatus(actorOf(w.s1), bugId, "RESOLVED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setTicketStatus(actorOf(w.s1), bugId, "CLOSED")).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    await setTicketStatus(actorOf(w.pa), bugId, "RESOLVED");
    await setTicketStatus(actorOf(w.s1), bugId, "CLOSED");
    await expect(replyToTicket(actorOf(w.s1), bugId, { body: "one more thing" })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    await setTicketStatus(actorOf(w.s1), bugId, "OPEN");
    const t = await db().helpdeskTicket.findUniqueOrThrow({ where: { id: bugId } });
    expect([t.status, t.reopenedCount, t.closedAt]).toEqual(["OPEN", 1, null]);
  });

  it("converts a ticket to a knowledge-base FAQ once", async () => {
    await expect(convertToFaq(actorOf(w.s1), bugId, { title: "Calendar blank?", body: "Switch to the compliance layer." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const a = await convertToFaq(actorOf(w.pa), bugId, { title: "Calendar blank?", body: "Switch to the compliance layer to see every task." });
    expect(a.kind).toBe("FAQ");
    expect(a.tagsCsv.split(",")).toContain("FAQ");
    expect(a.publishedAt).not.toBeNull();
    expect((await db().helpdeskTicket.findUniqueOrThrow({ where: { id: bugId } })).faqArticleId).toBe(a.id);
    await expect(convertToFaq(actorOf(w.pa), bugId, { title: "Again", body: "Second conversion attempt." })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
  });

  it("flags long-open tickets and stores screenshots privately", async () => {
    await db().helpdeskTicket.update({ where: { id: hrId }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
    expect((await listQueue(actorOf(w.hr), { longOpenOnly: true })).map((t) => t.id)).toEqual([hrId]);
    expect((await myTickets(actorOf(w.a1)))[0]!.longOpen).toBe(true);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
    const t = await raiseTicket(actorOf(w.s2), { category: "ACCESS", subject: "Cannot open client", description: "Access denied on the client page." }, { name: "shot.png", data: png });
    expect(t.screenshotDocId).toBeTruthy();
    await expect(raiseTicket(actorOf(w.s2), { category: "OTHER", subject: "Wrong type file", description: "Attaching a text file here." }, { name: "x.txt", data: Buffer.from("hello") })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await ticketScreenshot(actorOf(w.s2), t.id)).data.equals(png)).toBe(true);
    expect((await ticketScreenshot(actorOf(w.pa), t.id)).fileName).toBe("shot.png");
    await expect(ticketScreenshot(actorOf(w.s1), t.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ticketScreenshot(actorOf(w.hr), t.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
