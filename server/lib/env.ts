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
