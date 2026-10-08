import fs from "node:fs";
import path from "node:path";

/** Static scan helpers for the authorization review (D-86). Plain text analysis: no TypeScript compiler needed. */
export function walk(dir: string, pred: (f: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

/** The text of a function body starting at the first "{" after `from`, by brace matching (ignores braces in strings well enough for our code). */
export function bodyFrom(src: string, from: number): string {
  // Skip the parameter list (balanced parentheses), then a return-type annotation, to reach the body's "{".
  let i = src.indexOf("(", from);
  for (let depth = 0; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) break;
  }
  i++;
  while (/\s/.test(src[i] ?? "")) i++;
  if (src[i] === ":") {
    i++;
    let angle = 0;
    let brace = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "<") angle++;
      else if (c === ">" && src[i - 1] !== "=") angle--;
      else if (c === "{" && angle === 0 && brace === 0 && /[\w>\]\)]\s*$/.test(src.slice(Math.max(0, i - 40), i))) break; // body after a type name
      else if (c === "{") brace++;
      else if (c === "}") brace--;
    }
  }
  const start = src.indexOf("{", i);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

export type Fn = { file: string; name: string; body: string; actorParam: boolean; exported: boolean };

/**
 * Every function declaration and arrow-function constant in a file, with its body. Private helpers are kept so
 * that a public function guarded through a local helper (e.g. `assertHrAccess`) counts as guarded.
 */
export function exportedFunctions(file: string): Fn[] {
  const src = fs.readFileSync(file, "utf8");
  const out: Fn[] = [];
  for (const m of src.matchAll(/(export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)/g)) {
    out.push({ file, name: m[2]!, body: bodyFrom(src, m.index!), actorParam: /^\s*actor\s*[:?]/.test(m[3]!), exported: !!m[1] });
  }
  for (const m of src.matchAll(/(export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]+)?=>/g)) {
    const after = src.slice(m.index! + m[0].length).trimStart();
    const body = after.startsWith("{") ? bodyFrom(src, m.index! + m[0].length - 1) : after.split("\n")[0]!;
    out.push({ file, name: m[2]!, body, actorParam: /^\s*actor\s*[:?]/.test(m[3]!), exported: !!m[1] });
  }
  return out;
}

/**
 * What counts as a check: capability / scope guards, record loaders that check access, module role predicates,
 * realm checks ("portal users refused"), and self-scoping (the function only touches the caller's own rows).
 */
export const GUARD = new RegExp(
  [
    String.raw`\b(authorize|authorizeBilling|can|scopeOf|staffOnly|staffScope|requireCap|assert[A-Z]\w*|load[A-Z]\w*|visible\w*|billingClientIds|clientWhere|taskWhere|engagementWhere|leadWhere|scopeWhere|requireStaff|requirePortal|getSession|accessTo|isHrOrPartner|canRunTraining|self|staffId)\s*\(`,
    String.raw`actor\.kind\s*[!=]==\s*"(PORTAL|USER)"`,
    String.raw`\b(id|userId|checkerId|interviewerId|portalUserId)\s*:\s*actor\.(userId|portalUserId)\b`,
  ].join("|"),
);

/** Functions that are guarded directly or call (with the actor) another guarded function, to a fixed point. */
export function unguarded(fns: Fn[]): Fn[] {
  const guarded = new Set(fns.filter((f) => GUARD.test(f.body)).map((f) => f.name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of fns) {
      if (guarded.has(f.name)) continue;
      const calls = [...f.body.matchAll(/\b(\w+)\s*\(\s*(?:actor|a)\b/g)].map((m) => m[1]!.replace(/^.*\./, ""));
      if (calls.some((c) => guarded.has(c))) {
        guarded.add(f.name);
        changed = true;
      }
    }
  }
  return fns.filter((f) => !guarded.has(f.name));
}
