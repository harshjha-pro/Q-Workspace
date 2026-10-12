import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaClient as MysqlPrismaClient } from "@/generated/prisma-mysql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "./env";
import { resolveDatabaseUrl } from "./database-url";

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

/**
 * Two databases, one codebase (D-98): SQLite (libsql) for the office install and the tests, MySQL/MariaDB for the
 * web deployment (Vercel + Hostinger). The URL decides. The MySQL client is generated from the same models
 * (scripts/mysql-schema.ts), so it is used through the SQLite client's types.
 */
export type Dialect = "sqlite" | "mysql";
export const dialectOf = (url: string): Dialect => (/^(mysql|mariadb):\/\//i.test(url) ? "mysql" : "sqlite");
const databaseUrl = () => resolveDatabaseUrl() ?? env().DATABASE_URL;
export const dialect = (): Dialect => dialectOf(databaseUrl());

function createMysql(url: string): PrismaClient {
  const u = new URL(url);
  const adapter = new PrismaMariaDb({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    // Serverless functions each hold a small pool; shared-hosting MySQL limits connections per user.
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 3),
    acquireTimeout: 20_000,
    connectTimeout: 15_000,
    ...(u.searchParams.get("ssl") === "true" ? { ssl: { rejectUnauthorized: u.searchParams.get("sslVerify") !== "false" } } : {}),
  });
  return new MysqlPrismaClient({ adapter }) as unknown as PrismaClient;
}

export function createPrisma(url: string) {
  if (dialectOf(url) === "mysql") return createMysql(url);
  const factory = new PrismaLibSql({ url });
  const connect = factory.connect.bind(factory);
  factory.connect = async () => Object.assign(await connect(), { getConnectionInfo: () => ({ supportsRelationJoins: false, maxBindValues: SQLITE_MAX_BIND_VALUES }) });
  return new PrismaClient({ adapter: factory });
}

/** The shared client. A function (not a constant) so backup-restore can swap the file and reconnect. */
export function db(): PrismaClient {
  if (!g.__qepexPrisma) {
    // Read DATABASE_URL at connect time (tests point each file at its own copy).
    const url = databaseUrl();
    g.__qepexPrisma = createPrisma(url);
    // WAL lets the many readers on the LAN work while one write is in progress (SQLite only).
    if (dialectOf(url) === "sqlite") g.__qepexPragmas = g.__qepexPrisma
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
