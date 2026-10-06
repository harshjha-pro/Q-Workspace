import { getSession } from "@/server/context";
import { documentForDownload } from "@/server/services/documents/service";
import { isDomainError } from "@/server/lib/errors";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response("Unauthorised", { status: 401 });
  const { id } = await ctx.params;
  try {
    const f = await documentForDownload(s.actor, id);
    return new Response(new Uint8Array(f.data), {
      headers: {
        "content-type": f.mimeType,
        "content-disposition": `attachment; filename="${encodeURIComponent(f.fileName)}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    return new Response(isDomainError(e) ? e.message : "Error", { status: isDomainError(e) && e.code === "FORBIDDEN" ? 403 : 404 });
  }
}
