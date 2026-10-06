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
