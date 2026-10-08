/**
 * Phase 4 reference data. Client-document reminder schedules are the firm's own working habit, not statutory
 * values: two general placeholders (any compliance type) that the firm edits under Reminders → Schedules.
 */
import type { PrismaClient } from "../../../generated/prisma/client";

export const REMINDER_SCHEDULES = [
  { name: "Pending documents — early month (placeholder)", dayOfMonth: 3, escalateAfter: 3 },
  { name: "Pending documents — mid month (placeholder)", dayOfMonth: 12, escalateAfter: 3 },
];

/** Idempotent: matched by name, never overwritten once the firm edits a schedule. */
export async function seedPortalReference(db: PrismaClient) {
  for (const s of REMINDER_SCHEDULES) {
    if (!(await db.clientReminderSchedule.findFirst({ where: { name: s.name } }))) {
      await db.clientReminderSchedule.create({ data: { ...s, complianceTypeCode: null, monthsCsv: "", messageText: "", createdById: "system" } });
    }
  }
}
