import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { env } from "./env";

export type Tx = Prisma.TransactionClient;
export { Prisma };

const g = globalThis as unknown as { __qepexPrisma?: PrismaClient; __qepexPragmas?: Promise<void> };

export function createPrisma(url: string) {
  return new PrismaClient({ adapter: new PrismaLibSql({ url }) });
}

/** The shared client. A function (not a constant) so backup-restore can swap the file and reconnect. */
export function db(): PrismaClient {
  if (!g.__qepexPrisma) {
    // Read DATABASE_URL at connect time (tests point each file at its own copy).
    g.__qepexPrisma = createPrisma(process.env.DATABASE_URL ?? env().DATABASE_URL);
    // WAL lets the many readers on the LAN work while one write is in progress.
    g.__qepexPragmas = g.__qepexPrisma
      .$queryRawUnsafe("PRAGMA journal_mode=WAL")
      .then(() => g.__qepexPrisma!.$queryRawUnsafe("PRAGMA busy_timeout=5000"))
      .then(() => undefined)
      .catch(() => undefined);
  }
  return g.__qepexPrisma;
}

export async function disconnectDb() {
  if (g.__qepexPrisma) {
    await g.__qepexPrisma.$disconnect();
    g.__qepexPrisma = undefined;
  }
}

/** Run fn in one transaction; every service mutation goes through this. */
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().$transaction(fn, { timeout: 30_000, maxWait: 10_000 });
}
