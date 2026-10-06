import { getSession } from "@/server/context";
import { importTemplate } from "@/server/services/import/service";
import { isDomainError } from "@/server/lib/errors";
import type { ImportKind } from "@/server/services/import/definitions";

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  const { kind } = await ctx.params;
  try {
    const t = await importTemplate(s.actor, kind as ImportKind);
    return new Response(new Uint8Array(t.data), {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${t.fileName}"`, "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(isDomainError(e) ? e.message : "Error", { status: isDomainError(e) ? 403 : 500 });
  }
}
