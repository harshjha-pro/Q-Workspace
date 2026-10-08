import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeClient, makeEngagement } from "../helpers/factory";
import { db } from "@/server/lib/db";
import type { PortalActor } from "@/server/permissions/actor";
import {
  startThread, postMessage, getThread, listThreads, setThreadClosed, unreadThreads, responseTimes, responseStats, runUnansweredMessageReminders,
} from "@/server/services/messages/service";
import { portalDownload } from "@/server/services/portal/actions";
import { deactivateUser } from "@/server/services/users/service";

let w: Awaited<ReturnType<typeof buildWorld>>;
let portal: PortalActor; // c1
let other: PortalActor; // c2
let threadId: string;

async function setSetting(key: string, value: unknown) {
  await db().setting.upsert({ where: { key }, create: { key, valueJson: JSON.stringify(value) }, update: { valueJson: JSON.stringify(value) } });
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  portal = w.portal;
  const pu = await db().portalUser.create({ data: { name: "C2 Owner", email: "owner2@c2.example.com", clients: { create: { clientId: w.c2.id } } } });
  other = { kind: "PORTAL", portalUserId: pu.id, role: "PORTAL", clientIds: [w.c2.id], displayName: "C2 Owner" };
});

describe("pure response-time calculation", () => {
  it("measures from the first client message of a run to the next firm reply", () => {
    const t = (min: number) => new Date(Date.UTC(2026, 9, 1, 4, min));
    expect(responseTimes([
      { sentAt: t(0), fromClient: true }, { sentAt: t(10), fromClient: true }, { sentAt: t(45), fromClient: false },
      { sentAt: t(50), fromClient: false }, { sentAt: t(55), fromClient: true },
    ])).toEqual([{ waitedFrom: t(0), minutes: 45 }]);
    expect(responseTimes([{ sentAt: t(0), fromClient: false }])).toEqual([]);
  });
});

describe("conversations (P4-04)", () => {
  it("a client starts a thread on their own client only; the team is told", async () => {
    await expect(startThread(portal, { clientId: w.c2.id, subject: "Hello", body: "Hi" })).rejects.toThrow(/access/);
    await expect(startThread(portal, { clientId: w.c1.id, engagementId: w.e2.id, subject: "Hello", body: "Hi" })).rejects.toThrow(/another client/);
    const t = await startThread(portal, { clientId: w.c1.id, engagementId: w.e1.id, subject: "TDS on rent", body: "Do we deduct TDS on the new office rent?" });
    threadId = t.id;
    const row = await db().messageThread.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.firstUnansweredAt).not.toBeNull();
    // Nobody has written from the firm yet → the client's Manager and Partner are notified.
    expect(await db().notification.count({ where: { userId: { in: [w.m1.id, w.partner.id] }, kind: "CLIENT_MESSAGE" } })).toBe(2);
    expect(await unreadThreads(actorOf(w.m1))).toBe(1);
  });

  it("staff visibility follows portal.share scope; HR and other teams cannot see; other portal clients cannot", async () => {
    expect((await listThreads(actorOf(w.partner))).map((t) => t.id)).toContain(threadId);
    expect((await listThreads(actorOf(w.pa))).map((t) => t.id)).toContain(threadId);
    expect((await listThreads(actorOf(w.m1))).map((t) => t.id)).toContain(threadId);
    expect((await listThreads(actorOf(w.s1))).map((t) => t.id)).toContain(threadId); // assigned to e1
    expect(await listThreads(actorOf(w.m2))).toEqual([]);
    expect(await listThreads(actorOf(w.s2))).toEqual([]);
    expect(await listThreads(other)).toEqual([]);
    await expect(listThreads(actorOf(w.hr))).rejects.toThrow(/access/);
    await expect(getThread(actorOf(w.m2), threadId)).rejects.toThrow(/not found/);
    await expect(getThread(other, threadId)).rejects.toThrow(/not found/);
    await expect(postMessage(actorOf(w.s2), threadId, { body: "x" })).rejects.toThrow(/not found/);
    // Senior assigned only to another engagement of c1 cannot see the e1 thread.
    const e3 = await makeEngagement(w.c1.id, { assignUserIds: [w.s2.id] });
    void e3;
    expect((await listThreads(actorOf(w.s2))).map((t) => t.id)).not.toContain(threadId);
  });

  it("a staff reply with an attachment: filed in the DMS, shared, response time recorded, sender becomes a participant", async () => {
    await postMessage(actorOf(w.s1), threadId, { body: "Yes, if the annual rent is above the threshold. Working attached." }, { name: "tds-rent.txt", data: Buffer.from("working") });
    const row = await db().messageThread.findUniqueOrThrow({ where: { id: threadId } });
    expect(row.firstUnansweredAt).toBeNull();
    expect(await db().messageThreadParticipant.count({ where: { threadId, userId: w.s1.id } })).toBe(1);
    const doc = await db().document.findFirstOrThrow({ where: { sourceType: "MESSAGE", clientId: w.c1.id } });
    expect(doc).toMatchObject({ sharedWithClient: true, engagementId: w.e1.id });
    // The client can open and download it; the other client cannot.
    const v = await getThread(portal, threadId);
    expect(v.messages.map((m) => [m.author, m.fromClient])).toEqual([["CFO", true], [w.s1.displayName, false]]);
    expect(v.messages[1]!.attachment).toEqual({ id: doc.id, name: "tds-rent.txt" });
    expect((await portalDownload(portal, doc.id)).data.toString()).toBe("working");
    await expect(portalDownload(other, doc.id)).rejects.toThrow();
    // Reading marks it read for the firm side.
    expect((await getThread(actorOf(w.s1), threadId)).messages[1]!.readByOtherSide).toBe(true);
    expect(await unreadThreads(portal)).toBe(0);
  });

  it("client replies notify the participants; the portal view hides internal flags and engagement codes", async () => {
    await postMessage(portal, threadId, { body: "Thanks. What rate?" });
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "CLIENT_MESSAGE" } })).toBe(1);
    const [row] = await listThreads(portal);
    expect(row).toMatchObject({ id: threadId, overdue: false });
    const v = await getThread(portal, threadId);
    expect(v.engagement).toEqual({ id: w.e1.id, name: expect.any(String) });
    expect(JSON.stringify(v)).not.toMatch(/"code"|budget|minutes/);
  });

  it("empty messages are refused; closed threads refuse staff replies; a client message reopens", async () => {
    await expect(postMessage(portal, threadId, { body: "  " })).rejects.toThrow(/Write a message/);
    await postMessage(actorOf(w.s1), threadId, { body: "Rate as per the Act; we will confirm." });
    await expect(setThreadClosed(other as never, threadId, true)).rejects.toThrow();
    await setThreadClosed(actorOf(w.s1), threadId, true);
    await expect(postMessage(actorOf(w.s1), threadId, { body: "more" })).rejects.toThrow(/closed/);
    expect((await listThreads(actorOf(w.m1), { status: "closed" })).map((t) => t.id)).toEqual([threadId]);
    await postMessage(portal, threadId, { body: "One more question" });
    expect((await db().messageThread.findUniqueOrThrow({ where: { id: threadId } })).closedAt).toBeNull();
  });

  it("staff can start a thread only for a client with an active portal user", async () => {
    const lonely = await makeClient({ teamId: w.t1.id, managerId: w.m1.id });
    await expect(startThread(actorOf(w.m1), { clientId: lonely.id, subject: "Docs", body: "Please send" })).rejects.toThrow(/no active portal user/);
    await expect(startThread(actorOf(w.m2), { clientId: w.c1.id, subject: "Docs", body: "Please send" })).rejects.toThrow(/access/);
    const t = await startThread(actorOf(w.m1), { clientId: w.c1.id, subject: "Bank statements", body: "Please upload Sep statements." });
    expect((await db().messageThread.findUniqueOrThrow({ where: { id: t.id } })).firstUnansweredAt).toBeNull();
    expect(await unreadThreads(portal)).toBe(1);
  });
});

describe("response target and reminders", () => {
  it("flags threads waiting longer than the target and reminds once per waiting spell", async () => {
    await setSetting("messages.responseHours", 2);
    await db().messageThread.update({ where: { id: threadId }, data: { firstUnansweredAt: new Date(Date.now() - 3 * 3600_000) } });
    const rows = await listThreads(actorOf(w.m1), { status: "waiting" });
    expect(rows[0]).toMatchObject({ id: threadId, overdue: true });
    expect((await listThreads(portal)).find((r) => r.id === threadId)!.overdue).toBe(false); // internal flag
    expect(await runUnansweredMessageReminders()).toEqual({ waitingOverTarget: 1, reminded: 1 });
    await runUnansweredMessageReminders();
    expect(await db().notification.count({ where: { kind: "MESSAGE_UNANSWERED", userId: w.s1.id } })).toBe(1);
    expect(await db().notification.count({ where: { kind: "MESSAGE_UNANSWERED", userId: w.m1.id } })).toBe(1);
    const stats = await responseStats(actorOf(w.m1));
    expect(stats).toMatchObject({ targetHours: 2, waitingNow: 1, overdueNow: 1 });
    expect(stats.replies).toBeGreaterThanOrEqual(2);
    await expect(responseStats(portal)).rejects.toThrow();
    await setSetting("messages.responseHours", 24);
  });

  it("offboarded staff stop being notified; the client's team is told instead", async () => {
    await deactivateUser(actorOf(w.pa), w.s1.id, "Left the firm");
    expect((await db().messageThreadParticipant.findFirstOrThrow({ where: { threadId, userId: w.s1.id } })).removedAt).not.toBeNull();
    const before = await db().notification.count({ where: { userId: w.m1.id, kind: "CLIENT_MESSAGE" } });
    await postMessage(portal, threadId, { body: "Anyone there?" });
    expect(await db().notification.count({ where: { userId: w.m1.id, kind: "CLIENT_MESSAGE" } })).toBe(before + 1);
  });
});
