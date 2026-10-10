import "dotenv/config";
import { reconcileAnalytics } from "../server/services/analytics/reconcile";

/**
 * Check (changing no data) that every analytics number matches a direct query on the data (5.8).
 * Usage: npm run analytics:reconcile [-- period] (period: this-month | last-month | last-90 | fytd | last-fy | custom:A:B)
 */
const periods = process.argv.slice(2).length ? process.argv.slice(2) : ["this-month", "last-month", "fytd", "last-fy"];
let failed = 0;
for (const period of periods) {
  const checks = await reconcileAnalytics({ period });
  const bad = checks.filter((c) => !c.ok);
  failed += bad.length;
  console.log(`${period}: ${checks.length - bad.length}/${checks.length} checks match`);
  for (const c of bad) console.log(`  MISMATCH ${c.area} · ${c.name}: expected ${c.expected}, dashboard ${c.actual}`);
}
process.exit(failed ? 1 : 0);
