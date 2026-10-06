import fs from "node:fs";
import { getSession } from "@/server/context";
import { backupFileForDownload } from "@/server/services/backup/service";
import { isDomainError } from "@/server/lib/errors";

/** Full export download — Partner only (spec 14.5); audited by the service. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  const { id } = await ctx.params;
  try {
    const f = await backupFileForDownload(s.actor, id);
    return new Response(new Uint8Array(fs.readFileSync(f.abs)), {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${f.fileName}"`, "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(isDomainError(e) ? e.message : "Error", { status: isDomainError(e) && e.code === "FORBIDDEN" ? 403 : 404 });
  }
}
