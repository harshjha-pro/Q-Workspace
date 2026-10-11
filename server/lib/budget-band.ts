/**
 * Budget band level from percent used (spec 5.3; thresholds from the `budget.bands` setting, default 85/100/110):
 * 0 = under the first band, 1 = approaching, 2 = reached, 3 = significant overrun. One rule for the work-entry
 * banner and analytics, which word the levels for their own screens.
 */
export function budgetLevel(percent: number, bands: number[]): 0 | 1 | 2 | 3 {
  const [a, b, c] = bands;
  return percent >= c! ? 3 : percent >= b! ? 2 : percent >= a! ? 1 : 0;
}
