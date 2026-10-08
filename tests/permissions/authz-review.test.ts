import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { walk, exportedFunctions, unguarded, bodyFrom } from "./authz-scan";

/**
 * Authorization review as a test (4.7, Q-15, D-86): instead of an external penetration test, every entry point
 * is checked mechanically on each run, so a new page, action, route or service function without a check fails CI.
 * Exceptions are listed here with the reason, and reviewed when this list changes.
 */

const SERVICE_EXCEPTIONS: Record<string, string> = {
  "import/service.ts importKindsFor": "Filters the import kinds by the caller's role and returns names only",
};

const ACTION_EXCEPTIONS: Record<string, string> = {
  "app/login/actions.ts loginAction": "The sign-in itself",
  "app/portal/login/actions.ts portalLoginAction": "The portal sign-in itself",
  "app/portal/invite/[token]/actions.ts acceptInviteAction": "Possession of the one-time invite token is the credential",
};

const PAGE_EXCEPTIONS: Record<string, string> = {
  "app/(staff)/denied/page.tsx": "Static 'no access' message",
};

/**
 * Shared wrappers that resolve the user for the code they run. Each is accepted only because the test below
 * proves the wrapper itself calls the guard.
 */
const WRAPPERS: { file: string; name: string; guard: RegExp }[] = [
  { file: "app/(staff)/hr/recruitment/_act.ts", name: "act", guard: /\brequireStaff\s*\(/ },
  { file: "app/api/payroll/_lib/respond.ts", name: "payrollDownload", guard: /\bgetSession\s*\(/ },
];
const wrapperCall = new RegExp(`\\b(${WRAPPERS.map((w) => w.name).join("|")})\\s*\\(`);

const rel = (f: string) => f.split(/[\\/]/).join("/");

describe("authorization review (D-86)", () => {
  it("the accepted wrappers really check the user", () => {
    for (const w of WRAPPERS) {
      const fn = exportedFunctions(w.file).find((f) => f.name === w.name);
      expect(fn, `${w.file} ${w.name}`).toBeDefined();
      expect(w.guard.test(fn!.body), `${w.name} must call its guard`).toBe(true);
    }
  });

  it("every exported service function that takes an actor checks access (directly or through a guarded call)", () => {
    const fns = walk("server/services", (f) => f.endsWith(".ts")).flatMap(exportedFunctions);
    expect(fns.filter((f) => f.actorParam && f.exported).length).toBeGreaterThan(500); // the scan really ran
    const missing = unguarded(fns)
      .filter((f) => f.actorParam && f.exported)
      .map((f) => `${rel(f.file).replace("server/services/", "")} ${f.name}`)
      .filter((k) => !SERVICE_EXCEPTIONS[k]);
    expect(missing).toEqual([]);
  });

  it("every API route handler checks the session; handlers that change data also refuse cross-site requests", () => {
    const routes = walk("app/api", (f) => f.endsWith("route.ts")).filter((f) => !rel(f).includes("app/api/auth/"));
    expect(routes.length).toBeGreaterThan(10);
    const problems: string[] = [];
    for (const file of routes) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)) {
        const body = bodyFrom(src, m.index!);
        if (!/\bgetSession\s*\(|\brequireStaff\s*\(|\brequirePortal\s*\(/.test(body) && !wrapperCall.test(body)) problems.push(`${rel(file)} ${m[1]}: no session check`);
        if (m[1] !== "GET" && !/\bcrossSiteRefused\s*\(/.test(body)) problems.push(`${rel(file)} ${m[1]}: no cross-site check`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every server action resolves the signed-in user (staff or portal)", () => {
    const files = walk("app", (f) => /\.(ts|tsx)$/.test(f)).filter((f) => /^\s*["']use server["']/.test(fs.readFileSync(f, "utf8")));
    expect(files.length).toBeGreaterThan(30);
    const problems: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)) {
        const key = `${rel(file)} ${m[1]}`;
        if (ACTION_EXCEPTIONS[key]) continue;
        const body = bodyFrom(src, m.index!);
        // Directly, or through a local helper that does it (e.g. `run(...)` wrappers taking an actor resolved inside).
        if (!/\brequireStaff\s*\(|\brequirePortal\s*\(|\bgetSession\s*\(/.test(body) && !wrapperCall.test(body)) problems.push(key);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every staff page calls requireStaff and every portal page calls requirePortal", () => {
    const problems: string[] = [];
    for (const [dir, guard] of [["app/(staff)", "requireStaff"], ["app/portal/(app)", "requirePortal"]] as const) {
      for (const file of walk(dir, (f) => f.endsWith("page.tsx"))) {
        if (PAGE_EXCEPTIONS[rel(file)]) continue;
        const src = fs.readFileSync(file, "utf8");
        // A page that only redirects and imports no services reads no data.
        const redirectOnly = /\bredirect\s*\(/.test(src) && !/@\/server\/services\//.test(src);
        if (!redirectOnly && !new RegExp(`\\b${guard}\\s*\\(`).test(src)) problems.push(rel(file));
      }
    }
    expect(problems).toEqual([]);
  });
});
