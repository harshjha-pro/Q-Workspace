import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { env } from "./env";

export type Tx = Prisma.TransactionClient;
export { Prisma };

const g = globalThis as unknown as { __qepexPrisma?: PrismaClient; __qepexPragmas?: Promise<void> };

/**
 * SQLite as bundled with libsql accepts 32,766 bound parameters per statement, but the libsql adapter does not
 * report it, so Prisma assumes the old 999 and refuses an `in` list of 1,000+ ids (P2029), e.g. the
 * engagement portfolio of a firm with over a thousand engagements. Reporting the real limit lets those queries
 * run, and Prisma splits anything larger itself (D-95).
 */
const SQLITE_MAX_BIND_VALUES = 32_766;

export function createPrisma(url: string) {
  const factory = new PrismaLibSql({ url });
  const connect = factory.connect.bind(factory);
  factory.connect = async () => Object.assign(await connect(), { getConnectionInfo: () => ({ supportsRelationJoins: false, maxBindValues: SQLITE_MAX_BIND_VALUES }) });
  return new PrismaClient({ adapter: factory });
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
