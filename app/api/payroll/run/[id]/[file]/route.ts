import { RUN_FILES, runFile, type RunFile } from "@/server/services/payroll/outputs";
import { payrollDownload } from "../../../_lib/respond";

/** GET /api/payroll/run/<id>/<bank|pf-ecr|esi|pt|register> — Excel outputs of a run (HR/Partner). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  if (!RUN_FILES.includes(file as RunFile)) return new Response("Unknown file", { status: 404 });
  return payrollDownload((actor) => runFile(actor, id, file as RunFile));
}
