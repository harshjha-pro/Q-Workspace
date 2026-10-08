/**
 * Cross-site request guard for API routes that change data (security checklist S-07). Server actions get this
 * check from Next.js; plain route handlers do it themselves. A missing Origin (same-origin fetch from older
 * browsers, curl) is allowed — the session cookie is SameSite=Lax, so a cross-site POST carries no session anyway.
 */
export function crossSiteRefused(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch {
    /* malformed Origin: refuse */
  }
  return new Response("Cross-site request refused", { status: 403 });
}
