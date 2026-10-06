export type DomainErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "UNAUTHENTICATED"
  | "LOCKED"
  | "RULE_VIOLATION";

/** Typed error thrown by services; routes turn it into a user message. Never carries secrets. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const forbidden = (msg = "You do not have access to this.") => new DomainError("FORBIDDEN", msg);
export const notFound = (what = "Record") => new DomainError("NOT_FOUND", `${what} not found.`);
export const ruleViolation = (msg: string) => new DomainError("RULE_VIOLATION", msg);
export const conflict = (msg: string) => new DomainError("CONFLICT", msg);

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
