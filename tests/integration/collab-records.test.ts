import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { todayIst, addDays } from "@/server/lib/dates";
import { seedCollabReference } from "@/prisma/seed/phase3/collab";
import { addComment, editComment, deleteComment, listComments, mentionCandidates, parseMentions } from "@/server/services/comments/service";
import { scheduleMeeting, addActionItem, listMeetings, getMeeting, meetingIcs, updateMeeting, istToUtcStamp } from "@/server/services/meetings/service";
import { createNotice } from "@/server/services/registers/notices";
import { createArticle, getArticle, listArticles, linkArticle, articlesLinkedTo, updateArticle } from "@/server/services/knowledge/service";

let w: Awaited<ReturnType<typeof buildWorld>>;
let taskId = "";
const today = todayIst();

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await seedCollabReference(db());
  const t = await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, title: "GSTR-3B Sep", periodKey: "X-1", isOneOff: true, effectiveDueDate: addDays(today, 5) } });
  await db().taskAssignment.create({ data: { taskId: t.id, userId: w.s1.id, role: "MAKER", fromDate: "2026-04-01" } });
  taskId = t.id;
});

describe("comments and @mentions (P3-32, spec 13.7)", () => {
  it("parses @usernames but not e-mail addresses", () => {
    expect(parseMentions("Hi @priya.nair and @rohan.iyer. Mail me at a@b.com")).toEqual(["priya.nair", "rohan.iyer"]);
  });

  it("notifies only mentioned people who can see the record", async () => {
    const m1 = await db().user.findUniqueOrThrow({ where: { id: w.m1.id } });
    const s2 = await db().user.findUniqueOrThrow({ where: { id: w.s2.id } });
    const hr = await db().user.findUniqueOrThrow({ where: { id: w.hr.id } });
    const r = await addComment(actorOf(w.s1), { entityType: "TASK", entityId: taskId, body: `@${m1.username} please review. @${s2.username} @${hr.username} FYI` });
    expect(r.notified).toBe(1);
    expect(r.notNotified.sort()).toEqual([s2.username, hr.username].sort());
    expect(await db().mention.findMany({ where: { commentId: r.comment.id } })).toHaveLength(1);
    const n = await db().notification.findFirstOrThrow({ where: { userId: w.m1.id, kind: "MENTION" } });
    expect(n.link).toBe(`/tasks/${taskId}#comment-${r.comment.id}`);
    expect(await db().notification.count({ where: { userId: { in: [w.s2.id, w.hr.id] }, kind: "MENTION" } })).toBe(0);
  });

  it("offers @mention candidates among people who can see the record", async () => {
    const ids = (await mentionCandidates(actorOf(w.s1), "TASK", taskId)).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([w.s1.id, w.m1.id, w.partner.id, w.pa.id]));
    expect(ids).not.toContain(w.s2.id);
    expect(ids).not.toContain(w.hr.id);
    expect(ids).not.toContain(w.m2.id);
  });

  it("thread visibility follows the record", async () => {
    expect((await listComments(actorOf(w.m1), "TASK", taskId)).comments).toHaveLength(1);
    await expect(listComments(actorOf(w.s2), "TASK", taskId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listComments(actorOf(w.hr), "TASK", taskId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addComment(actorOf(w.s2), { entityType: "TASK", entityId: taskId, body: "let me in" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("edits own comments within 15 minutes, newly mentioned people are notified; deletes softly with audit", async () => {
    const c = (await addComment(actorOf(w.m1), { entityType: "TASK", entityId: taskId, body: "First draft" })).comment;
    const partner = await db().user.findUniqueOrThrow({ where: { id: w.partner.id } });
    await expect(editComment(actorOf(w.s1), c.id, "hijack")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await editComment(actorOf(w.m1), c.id, `Second draft @${partner.username}`, new Date(c.createdAt.getTime() + 14 * 60_000));
    expect(await db().notification.count({ where: { userId: w.partner.id, kind: "MENTION" } })).toBe(1);
    await expect(editComment(actorOf(w.m1), c.id, "too late", new Date(c.createdAt.getTime() + 16 * 60_000))).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    await deleteComment(actorOf(w.m1), c.id);
    const thread = await listComments(actorOf(w.s1), "TASK", taskId);
    const del = thread.comments.find((x) => x.id === c.id)!;
    expect([del.deleted, del.body]).toEqual([true, ""]);
    const audit = await db().auditLog.findMany({ where: { entityType: "Comment", entityId: c.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
    await expect(editComment(actorOf(w.m1), c.id, "after delete")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("works on notices (assignee) and engagements; archived engagements are read-only", async () => {
    const n = await createNotice(actorOf(w.m1), { clientId: w.c1.id, authority: "GST", receivedDate: today, assigneeId: w.s1.id, createTask: false });
    await addComment(actorOf(w.s1), { entityType: "NOTICE", entityId: n.id, body: "Draft reply uploaded." });
    await expect(addComment(actorOf(w.s2), { entityType: "NOTICE", entityId: n.id, body: "?" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await addComment(actorOf(w.s1), { entityType: "ENGAGEMENT", entityId: w.e1.id, body: "Kick-off done." });
    await db().engagement.update({ where: { id: w.e1.id }, data: { archivedAt: new Date() } });
    await expect(addComment(actorOf(w.m1), { entityType: "ENGAGEMENT", entityId: w.e1.id, body: "late" })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    expect((await listComments(actorOf(w.m1), "ENGAGEMENT", w.e1.id)).readOnly).toBe(true);
    await db().engagement.update({ where: { id: w.e1.id }, data: { archivedAt: null } });
  });
});

describe("client meetings (P3-33, spec 13.8)", () => {
  let meetingId = "";
  let contactId = "";

  it("schedules within client scope with internal and client attendees", async () => {
    contactId = (await db().contact.create({ data: { clientId: w.c1.id, name: "Ravi CFO", email: "ravi@example.com" } })).id;
    const other = await db().contact.create({ data: { clientId: w.c2.id, name: "Other client" } });
    const input = { clientId: w.c1.id, title: "Quarterly review", scheduledAt: `${addDays(today, 3)}T11:00`, userIds: [w.s1.id], contactIds: [contactId] };
    await expect(scheduleMeeting(actorOf(w.m2), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(scheduleMeeting(actorOf(w.a1), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(scheduleMeeting(actorOf(w.hr), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(scheduleMeeting(actorOf(w.m1), { ...input, contactIds: [other.id] })).rejects.toMatchObject({ code: "VALIDATION" });
    const m = await scheduleMeeting(actorOf(w.m1), input);
    meetingId = m.id;
    expect(await db().meetingAttendee.count({ where: { meetingId } })).toBe(3); // organiser + s1 + contact
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "MEETING" } })).toBe(1);
    expect((await scheduleMeeting(actorOf(w.s1), { ...input, title: "Staff-run follow-up" })).organizerId).toBe(w.s1.id); // Staff: assigned clients
  });

  it("lists per scope and per client", async () => {
    expect((await listMeetings(actorOf(w.m1), { clientId: w.c1.id })).length).toBe(2);
    expect(await listMeetings(actorOf(w.m2))).toHaveLength(0);
    await expect(getMeeting(actorOf(w.s2), meetingId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("action items become one-off tasks with owner and due date", async () => {
    await expect(addActionItem(actorOf(w.m1), meetingId, { title: "Send TDS workings", ownerId: w.hr.id, dueDate: addDays(today, 7) })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    const item = await addActionItem(actorOf(w.m1), meetingId, { title: "Send TDS workings", ownerId: w.s1.id, dueDate: addDays(today, 7) });
    const t = await db().task.findUniqueOrThrow({ where: { id: item.taskId! }, include: { assignments: true } });
    expect([t.clientId, t.effectiveDueDate, t.isOneOff, t.complianceTypeCode]).toEqual([w.c1.id, addDays(today, 7), true, null]);
    expect(t.assignments.filter((a) => a.userId === w.s1.id).map((a) => a.role).sort()).toEqual(["ASSIGNEE", "MAKER"]);
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "ASSIGNED" } })).toBe(1);
    expect(await db().auditLog.count({ where: { entityType: "Task", entityId: t.id, action: "CREATE" } })).toBe(1);
    await updateMeeting(actorOf(w.m1), meetingId, { status: "HELD", notes: "Agreed next steps." });
    expect((await getMeeting(actorOf(w.m1), meetingId)).actionItems[0]!.taskStatus).toBe("UPCOMING");
  });

  it("downloads a timed .ics event in UTC", async () => {
    expect(istToUtcStamp("2026-10-10T11:00")).toBe("20261010T053000Z");
    const ics = await meetingIcs(actorOf(w.m1), meetingId);
    expect(ics.body).toContain(`DTSTART:${istToUtcStamp(`${addDays(today, 3)}T11:00`)}`);
    expect(ics.body).toContain(`DTEND:${istToUtcStamp(`${addDays(today, 3)}T11:00`, 60)}`);
    expect(ics.body).toContain("ATTENDEE;CN=Ravi CFO:mailto:ravi@example.com");
    expect(ics.body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
});

describe("knowledge base (P3-29, spec 13.4)", () => {
  it("writers create, drafts stay hidden, search works", async () => {
    await expect(createArticle(actorOf(w.s1), { title: "Nope", body: "Staff cannot write articles.", kind: "SOP" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const a = await createArticle(actorOf(w.m1), { title: "GSTR-3B checklist", body: "Reconcile GSTR-2B with purchases first.", kind: "SOP", serviceLine: "GST", tags: "GST, checklist" });
    const d = await createArticle(actorOf(w.hr), { title: "Leave policy FAQ draft", body: "Draft answer about leave.", kind: "FAQ", publish: false });
    expect((await listArticles(actorOf(w.s1), { q: "2B" })).map((x) => x.id)).toEqual([a.id]);
    expect((await listArticles(actorOf(w.s1))).map((x) => x.id)).not.toContain(d.id);
    await expect(getArticle(actorOf(w.s1), d.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listArticles(actorOf(w.m1), { includeDrafts: true })).map((x) => x.id)).toContain(d.id);
    await updateArticle(actorOf(w.hr), d.id, { publish: true });
    expect((await getArticle(actorOf(w.s1), d.id)).tags).toEqual([]);
    expect((await listArticles(actorOf(w.s1), { serviceLine: "GST" })).map((x) => x.id)).toEqual([a.id]);
  });

  it("links to the due-date master and shows read-by counts", async () => {
    const [a] = await listArticles(actorOf(w.pa), { q: "GSTR-3B" });
    await expect(linkArticle(actorOf(w.s1), a!.id, "COMPLIANCE_TYPE", "GST-3B-M")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(linkArticle(actorOf(w.pa), a!.id, "COMPLIANCE_TYPE", "NOPE")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const l1 = await linkArticle(actorOf(w.pa), a!.id, "COMPLIANCE_TYPE", "GST-3B-M");
    const l2 = await linkArticle(actorOf(w.pa), a!.id, "COMPLIANCE_TYPE", "GST-3B-M");
    expect(l2.id).toBe(l1.id);
    expect((await articlesLinkedTo(actorOf(w.s1), "COMPLIANCE_TYPE", "GST-3B-M")).map((x) => x.id)).toEqual([a!.id]);
    for (const u of [w.s1, w.a1]) await db().workEntry.create({ data: { userId: u.id, date: today, minutes: 30, knowledgeArticleId: a!.id } });
    await db().workEntry.create({ data: { userId: w.s1.id, date: addDays(today, -1), minutes: 15, knowledgeArticleId: a!.id } });
    const got = await getArticle(actorOf(w.s1), a!.id);
    expect([got.readBy, got.readByMe, got.links[0]!.entityType]).toEqual([2, true, "COMPLIANCE_TYPE"]);
  });
});
