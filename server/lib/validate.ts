import type { z } from "zod";
import { DomainError } from "./errors";

/** Parse service input; Zod issues become field errors the form can show. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  throw new DomainError("VALIDATION", "Please correct the highlighted fields.", fieldErrors);
}

export const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/**
 * Parse an update: only keys actually present in the input survive. Needed because Zod's
 * `.partial()` still applies `.default()` values, which would silently reset untouched fields.
 */
export function parsePartial<S extends z.ZodObject>(schema: S, input: unknown): Partial<z.infer<S>> {
  const parsed = parse(schema.partial(), input) as Record<string, unknown>;
  const present = input && typeof input === "object" ? Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined) : [];
  return Object.fromEntries(present.filter((k) => k in parsed).map((k) => [k, parsed[k]])) as Partial<z.infer<S>>;
}
