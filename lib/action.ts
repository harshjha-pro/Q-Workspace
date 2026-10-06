import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Map a thrown error to a form-friendly result. Unknown errors are logged, never shown raw. */
export function toActionError(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (isDomainError(e)) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  // Next.js redirects/notFound are thrown as errors with a digest; let them through.
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  logger().error({ err: e instanceof Error ? e.stack : String(e) }, "unexpected action error");
  return { ok: false, error: "Something went wrong. The error has been logged for the admin." };
}
