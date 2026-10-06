import bcrypt from "bcryptjs";

const cost = () => Number(process.env.BCRYPT_COST ?? 12);

export const hashPassword = (plain: string) => bcrypt.hash(plain, cost());
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Minimum policy: 10+ characters with a letter and a digit. Kept simple on purpose. */
export function passwordProblem(plain: string): string | null {
  if (plain.length < 10) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(plain) || !/[0-9]/.test(plain)) return "Use at least one letter and one number.";
  return null;
}
