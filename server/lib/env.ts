import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("file:./prisma/data/qepex.db"),
  STORAGE_DIR: z.string().default("./storage"),
  BACKUP_DIR: z.string().default("./backups"),
  LOG_DIR: z.string().default("./logs"),
  VAULT_KEY: z.string().min(40, "VAULT_KEY missing — run npm run setup"),
  PII_KEY: z.string().min(40, "PII_KEY missing — run npm run setup"),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
});

let cached: z.infer<typeof schema> | null = null;

/** Validated environment. Read lazily so `next build` does not need secrets. */
export function env() {
  cached ??= schema.parse(process.env);
  return cached;
}

export const isDemoMode = () => env().DEMO_MODE === "true";

/**
 * Demo only (D-100, owner's request): sign in with username + password alone. Needs both DEMO_MODE=true and
 * DEMO_SKIP_2FA=true, so turning demo mode off for real use restores two-factor login automatically.
 */
export const twoFactorSkipped = () => isDemoMode() && process.env.DEMO_SKIP_2FA === "true";
