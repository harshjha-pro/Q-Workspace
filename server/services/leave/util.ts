import { z } from "zod";
export { addDays, dayOfWeek, fyStartYear, fyLabel, todayIst } from "../../lib/dates";
export const zIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
