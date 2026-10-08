import { getSession } from "@/server/context";
import { syncOffline, type EntryInput } from "@/server/services/work/service";
import { isDomainError } from "@/server/lib/errors";
import { crossSiteRefused } from "@/lib/same-origin";

/** Offline queue upload (P2-38). Idempotent per entry clientUuid; results come back per entry. */
export async function POST(req: Request) {
  const refused = crossSiteRefused(req);
  if (refused) return refused;
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return Response.json({ error: "Unauthorised" }, { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return Response.json({ error: "Finish account setup first" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { entries?: unknown } | null;
  if (!body || !Array.isArray(body.entries)) return Response.json({ error: "Expected { entries: [] }" }, { status: 400 });
  const entries = body.entries.filter((e): e is EntryInput => !!e && typeof e === "object") as EntryInput[];
  try {
    const results = await syncOffline(s.actor, entries);
    return Response.json({ results }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const forbidden = isDomainError(e) && e.code === "FORBIDDEN";
    return Response.json({ error: isDomainError(e) ? e.message : "Error" }, { status: forbidden ? 403 : 500 });
  }
}
