import { db } from "../../lib/db";
import { isoFromParts, parseIso, todayIst } from "../../lib/dates";
import { systemActor } from "../../permissions/actor";
import { logger } from "../../lib/logger";
import { notifyUsers } from "../notifications/service";
import { billingSettings } from "./common";
import { createDraft, suggestFeeLines } from "./invoices";

/**
 * Retainer drafts (P3-35, job): for every active, chargeable RECURRING engagement on a RETAINER fee basis,
 * create one DRAFT invoice per month (fee ÷ billing.retainerMonthlyDivisor) for Partner approval.
 * Idempotent per engagement + month (Invoice.retainerPeriod), including
 * drafts the Partner discarded. Runs from billing.retainerDraftDay of the month onwards.
 */
export async function runRetainerDrafts(today: string = todayIst()) {
  const s = await billingSettings();
  const { y, m, d } = parseIso(today);
  if (d < s.retainerDay) return { period: null, created: 0, skipped: 0 };
  const period = today.slice(0, 7);
  const periodFrom = isoFromParts(y, m, 1);
  const periodTo = isoFromParts(y, m + 1, 0);
  const actor = systemActor();
  const engs = await db().engagement.findMany({
    where: {
      recurrence: "RECURRING", feeBasis: "RETAINER", chargeable: true, status: "ACTIVE", feePaise: { gt: 0 },
      OR: [{ startDate: null }, { startDate: { lte: periodTo } }],
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: periodFrom } }] }],
    },
    select: { id: true, clientId: true, name: true },
  });
  const existing = await db().invoice.findMany({ where: { isRetainerDraft: true, retainerPeriod: period, engagementId: { in: engs.map((e) => e.id) } }, select: { engagementId: true } });
  const done = new Set(existing.map((i) => i.engagementId));
  let created = 0;
  let skipped = 0;
  for (const e of engs) {
    if (done.has(e.id)) {
      skipped += 1;
      continue;
    }
    try {
      const lines = (await suggestFeeLines(actor, e.id, { from: periodFrom, to: periodTo })).map((l) => ({ ...l, description: `${e.name} — retainer fee for ${monthName(period)}` }));
      if (!lines.length) continue;
      await createDraft(actor, { clientId: e.clientId, engagementId: e.id, date: today, periodFrom, periodTo, lines }, { retainerPeriod: period });
      created += 1;
    } catch (err) {
      logger().warn({ engagementId: e.id, err: err instanceof Error ? err.message : String(err) }, "retainer draft skipped");
    }
  }
  if (created) {
    const partners = await db().user.findMany({ where: { role: "PARTNER", active: true }, select: { id: true } });
    await notifyUsers(partners.map((p) => p.id), {
      kind: "BILLING", title: `${created} retainer invoice draft${created === 1 ? "" : "s"} for ${monthName(period)}`, body: "Review, edit if needed and issue.",
      link: "/billing/invoices?status=DRAFT&retainer=1", dedupeKey: `retainer-drafts:${period}`,
    });
  }
  return { period, created, skipped };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monthName(period: string) {
  const [y, m] = period.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
