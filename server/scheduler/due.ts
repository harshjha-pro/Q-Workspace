import { parseIso } from "../lib/dates";

/**
 * Does a job's cron schedule (5 fields, IST) fire at least once on this IST day? Only the day-of-month and
 * day-of-week fields matter: the daily dispatcher runs once a day (D-99). Supports *, lists, ranges and steps.
 */
function matches(field: string, value: number, min: number, max: number) {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    const [lo, hi] = range === "*" ? [min, max] : range!.includes("-") ? range!.split("-").map(Number) : [Number(range), stepText ? max : Number(range)];
    return value >= lo! && value <= hi! && (value - lo!) % step === 0;
  });
}

export function dueOnDay(cron: string, isoDay: string): boolean {
  const [, , dom, mon, dow] = cron.trim().split(/\s+/);
  const { y, m, d } = parseIso(isoDay);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const domOk = matches(dom!, d, 1, 31);
  const dowOk = matches(dow!.replace(/\b7\b/g, "0"), weekday, 0, 6);
  // Standard cron: when both day fields are restricted, either may match.
  const dayOk = dom !== "*" && dow !== "*" ? domOk || dowOk : domOk && dowOk;
  return dayOk && matches(mon!, m, 1, 12);
}
