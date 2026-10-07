import { payslipPdf } from "@/server/services/payroll/outputs";
import { payrollDownload } from "../../_lib/respond";

/** GET /api/payroll/payslip/<id> — payslip PDF (the employee once published, or HR/Partner). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return payrollDownload((actor) => payslipPdf(actor, id));
}
