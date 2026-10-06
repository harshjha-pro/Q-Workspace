import { db } from "../../lib/db";
import { authorize, scopeOf } from "../../permissions/guards";
import { assertUserAccess, taskWhere, userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { requireStaff } from "../../permissions/guards";
import { addDays, todayIst } from "../../lib/dates";
import { listNotices } from "../registers/notices";

export type CalendarItem = { date: string; endDate?: string; kind: "TASK" | "HEARING" | "NOTICE" | "LEAVE" | "HOLIDAY"; title: string; sub?: string; link?: string; status?: string; mine?: boolean };
export type CalendarFilter = { from: string; to: string; layer?: "mine" | "compliance"; clientId?: string; userId?: string };
const OPEN = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

/** Calendar (P2-26): personal layer = my tasks, hearings, leave; compliance layer = every task in scope. Holidays always. */
export async function calendarItems(actor: Actor, f: CalendarFilter): Promise<CalendarItem[]> {
  requireStaff(actor);
  const scope = authorize(actor, "task.view");
  const me = actor.userId;
  const who = f.userId ?? me;
  if (who !== me) await assertUserAccess(actor, "work.viewOthers", who);
  const mine = f.layer !== "compliance";
  const tasks = await db().task.findMany({
    where: {
      AND: [
        taskWhere(actor, scope),
        { effectiveDueDate: { gte: f.from, lte: f.to } },
        f.clientId ? { clientId: f.clientId } : {},
        mine ? { assignments: { some: { userId: who, toDate: null } } } : { complianceTypeCode: { not: null } },
      ],
    },
    select: { id: true, title: true, effectiveDueDate: true, status: true, client: { select: { name: true } }, assignments: { where: { toDate: null, userId: me }, select: { id: true } } },
    orderBy: { effectiveDueDate: "asc" },
    take: 2000,
  });
  const items: CalendarItem[] = tasks.map((t) => ({ date: t.effectiveDueDate!, kind: "TASK", title: t.title, sub: t.client.name, link: `/tasks/${t.id}`, status: t.status, mine: t.assignments.length > 0 }));

  if (scopeOf(actor, "notice.view") !== "none") {
    const notices = await listNotices(actor, f.clientId ? { clientId: f.clientId } : {});
    for (const n of notices) {
      if (mine && n.assigneeId !== who && n.reviewerId !== who) continue;
      if (n.responseDueDate && n.responseDueDate >= f.from && n.responseDueDate <= f.to) items.push({ date: n.responseDueDate, kind: "NOTICE", title: `Notice response ${n.section ? `u/s ${n.section}` : ""}`.trim(), link: `/notices/${n.id}` });
    }
    const hearings = await db().hearing.findMany({ where: { date: { gte: f.from, lte: f.to }, noticeId: { in: notices.map((n) => n.id) } } });
    for (const h of hearings) items.push({ date: h.date, kind: "HEARING", title: h.kind === "ADJOURNMENT" ? "Adjourned hearing" : "Hearing", link: `/notices/${h.noticeId}` });
  }

  // Others' leave only for people the actor manages (spec 11.3); everyone else sees just their own.
  const peopleScope = scopeOf(actor, "work.viewOthers");
  const people = mine || peopleScope === "none" ? [who] : (await db().user.findMany({ where: userWhere(actor, peopleScope), select: { id: true } })).map((u) => u.id);
  const leave = await db().leaveRequest.findMany({ where: { status: "APPROVED", fromDate: { lte: f.to }, toDate: { gte: f.from }, userId: { in: people } } });
  const names = new Map((await db().user.findMany({ where: { id: { in: leave.map((l) => l.userId) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  for (const l of leave) items.push({ date: l.fromDate, endDate: l.toDate, kind: "LEAVE", title: mine ? "On leave" : `${names.get(l.userId) ?? ""} on leave` });

  const holidays = await db().holiday.findMany({ where: { date: { gte: f.from, lte: f.to }, stateCode: "-" } });
  for (const h of holidays) items.push({ date: h.date, kind: "HOLIDAY", title: h.name });
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// .ics (RFC 5545) — replaces calendar sync (brief §4): download and import into any calendar app.
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const compact = (d: string) => d.replace(/-/g, "");

/** Lines over 75 octets are folded with CRLF + space. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function toIcs(items: CalendarItem[], calName: string, baseUrl = "") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//QEPEX India//Work Tracker//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(calName)}`, "X-WR-TIMEZONE:Asia/Kolkata"];
  items.forEach((it, i) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${compact(it.date)}-${it.kind}-${i}-${Buffer.from(it.link ?? it.title).toString("base64url").slice(0, 24)}@qepex.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(it.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(it.endDate ?? it.date, 1))}`,
      `SUMMARY:${esc(it.sub ? `${it.title} — ${it.sub}` : it.title)}`,
      ...(it.link && baseUrl ? [`URL:${baseUrl}${it.link}`] : []),
      `CATEGORIES:${it.kind}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** My next 90 days (open tasks, hearings, leave, holidays) as an .ics file (P2-43). */
export async function myIcs(actor: Actor, baseUrl = "") {
  const today = todayIst();
  const items = (await calendarItems(actor, { from: today, to: addDays(today, 90), layer: "mine" })).filter((i) => i.kind !== "TASK" || OPEN.includes(i.status ?? ""));
  return toIcs(items, "QEPEX — my work", baseUrl);
}
