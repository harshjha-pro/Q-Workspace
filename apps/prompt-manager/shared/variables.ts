import type { VariableMeta } from './schema';

// Variables are identifiers in single curly braces: {company_name}. Escaped braces
// ({{literal}}) and JSON-like blocks ({ "a": 1 }) are ignored.
const VAR_RE = /(?<!\{)\{([A-Za-z_][A-Za-z0-9_.-]{0,63})\}(?!\})/g;

export function detectVariables(...texts: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(VAR_RE)) seen.add(m[1]);
  }
  return [...seen];
}

export function humanizeVariable(name: string): string {
  return name
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Merge detected variable names with stored metadata (required flag, description). */
export function mergeVariableMeta(content: string, meta: VariableMeta[] = [], extra?: string): VariableMeta[] {
  const names = detectVariables(content, extra);
  const byName = new Map(meta.map((m) => [m.name, m]));
  return names.map((name) => byName.get(name) ?? { name, required: true, description: '' });
}

/**
 * Fill variables without touching the template. Unfilled variables stay as {name}
 * so the user can see what is missing.
 */
export function fillVariables(content: string, values: Record<string, string>): string {
  return content.replace(VAR_RE, (whole, name: string) => {
    const v = values[name];
    return v !== undefined && v !== '' ? v : whole;
  });
}

export function missingRequired(meta: VariableMeta[], values: Record<string, string>): string[] {
  return meta.filter((m) => m.required && !(values[m.name] ?? '').trim()).map((m) => m.name);
}
