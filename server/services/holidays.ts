import { db } from "../lib/db";

/**
 * Holidays that close the office (Q-31): national and firm holidays (stateCode "-") plus the state
 * holidays of the firm's office state (firm profile; Rajasthan for QEPEX India). Used for leave days,
 * missing-entry checks, the week grid and the calendar. Statutory due dates are NOT shifted by state
 * holidays; the due-date master keeps using national holidays only.
 */
export async function officeHolidayStates(): Promise<string[]> {
  const firm = await db().firmProfile.findFirst({ select: { stateCode: true } });
  return firm?.stateCode ? ["-", firm.stateCode] : ["-"];
}
