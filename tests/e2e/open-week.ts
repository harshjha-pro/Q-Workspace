import "dotenv/config";
import { db, disconnectDb } from "../../server/lib/db";
import { addDays, todayIst, weekStart } from "../../server/lib/dates";
import { lockMomentFor } from "../../server/services/work/service";

/**
 * Flows log work "today". From Sunday 16:00 IST the current week is locked (Q-12), so on a Sunday evening the
 * Partner's documented lock extension (spec 5.6) is applied to this week before the run, as the firm would.
 */
const today = todayIst();
const lockAt = await lockMomentFor(today);
if (new Date() >= lockAt && !(await db().weeklyLock.findFirst({ where: { weekStart: weekStart(today), scope: "FIRM", extendedUntil: { gt: new Date() } } }))) {
  await db().weeklyLock.create({ data: { weekStart: weekStart(today), scope: "FIRM", lockAt, extendedUntil: new Date(`${addDays(today, 1)}T23:59:59+05:30`) } });
  console.log("Current week was locked; extended for the e2e run.");
}
await disconnectDb();
