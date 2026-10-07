import { tds24qFile } from "@/server/services/payroll/outputs";
import { payrollDownload } from "../_lib/respond";

/** GET /api/payroll/24q?fy=2026&q=1 — TDS on salary quarterly data (HR/Partner). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const fy = Number(q.get("fy"));
  const quarter = Number(q.get("q"));
  if (!Number.isInteger(fy) || fy < 2000 || fy > 2100 || ![1, 2, 3, 4].includes(quarter)) return new Response("Use ?fy=2026&q=1", { status: 400 });
  return payrollDownload((actor) => tds24qFile(actor, fy, quarter as 1 | 2 | 3 | 4));
}
