import type { VariableMeta } from './schema';

// Inputs (a.k.a. variables) appear in prompt text as {Input title}: letters, digits, spaces,
// underscores, dots and dashes, starting with a letter or underscore (so {company_name} and
// {Company name} both work). Escaped braces ({{literal}}) and JSON-like blocks ({ "a": 1 }) are ignored.
const VAR_RE = /(?<!\{)\{([A-Za-z_][A-Za-z0-9_ .-]{0,63}?)\s*\}(?!\})/g;
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function detectVariables(...texts: (string | undefined | null)[]): string[] {
  const seen = new Map<string, string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(VAR_RE)) { const name = m[1].trim(); if (name && !seen.has(key(name))) seen.set(key(name), name); }
  }
  return [...seen.values()];
}

export function humanizeVariable(name: string): string {
  if (/\s/.test(name.trim())) return name.trim(); // already a human title, e.g. "Company name"
  return name
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Inputs = inputs the user declared (kept even when not referenced in the text) + placeholders
 * found in the text. Placeholders that disappear from the text are dropped unless declared.
 */
export function mergeVariableMeta(content: string, meta: VariableMeta[] = [], extra?: string): VariableMeta[] {
  const byKey = new Map(meta.map((m) => [key(m.name), m]));
  const out = new Map<string, VariableMeta>();
  // Inputs placed in the text come first, in the order they appear.
  for (const name of detectVariables(content, extra)) {
    const prev = byKey.get(key(name));
    out.set(key(name), prev ? { ...prev, name: prev.declared ? prev.name.trim() : name, declared: !!prev.declared } : { name, required: true, description: '', declared: false });
  }
  // Then declared inputs that are not in the text (appended at the end of the completed prompt).
  for (const m of meta) if (m.declared && m.name?.trim() && !out.has(key(m.name))) out.set(key(m.name), { ...m, name: m.name.trim(), declared: true });
  return [...out.values()];
}

const lookup = (values: Record<string, string>) => {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== '') m.set(key(k), v);
  return m;
};

/**
 * Replace {Input} placeholders without touching the template. Unfilled placeholders stay as
 * {Input} so it is obvious what is missing.
 */
export function fillVariables(content: string, values: Record<string, string>): string {
  const vals = lookup(values);
  return content.replace(VAR_RE, (whole, name: string) => vals.get(key(name)) ?? whole);
}

/** The prompt text plus an "Inputs" list for filled inputs that are not placed in the text (placeholders untouched). */
export function withAppendedInputs(content: string, meta: VariableMeta[] = [], values: Record<string, string> = {}): string {
  const inText = new Set(detectVariables(content).map(key));
  const vals = lookup(values);
  const extra = meta.filter((m) => !inText.has(key(m.name)) && vals.get(key(m.name))?.trim());
  if (!extra.length) return content;
  return `${content.replace(/\s+$/, '')}\n\nInputs:\n${extra.map((m) => `- ${humanizeVariable(m.name)}: ${vals.get(key(m.name))}`).join('\n')}`;
}

/**
 * The text that gets copied / packed: placeholders filled in place, and every input that is NOT
 * referenced in the text appended at the end ("Inputs" section). Empty inputs are skipped.
 */
export function fillPrompt(content: string, meta: VariableMeta[] = [], values: Record<string, string> = {}): string {
  const body = fillVariables(content, values);
  const tail = withAppendedInputs('', meta.filter((m) => !detectVariables(content).some((n) => key(n) === key(m.name))), values);
  return tail ? `${body.replace(/\s+$/, '')}${tail}` : body;
}

export function missingRequired(meta: VariableMeta[], values: Record<string, string>): string[] {
  const vals = lookup(values);
  return meta.filter((m) => m.required && !(vals.get(key(m.name)) ?? '').trim()).map((m) => m.name);
}
