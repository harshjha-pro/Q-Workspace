/**
 * Vercel build (web deployment, D-98): check the MySQL schema mirror, apply pending MySQL migrations to the
 * Hostinger database (migrate deploy — never a reset), then build Next.js.
 */
import { execSync } from "node:child_process";
import { cleanDatabaseUrl } from "../server/lib/database-url";

function fail(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

const raw = cleanDatabaseUrl(process.env.DATABASE_URL ?? "");
if (!raw) {
  const nearMiss = Object.keys(process.env).find((k) => k !== "DATABASE_URL" && k.toUpperCase() === "DATABASE_URL");
  fail(nearMiss
    ? `Found "${nearMiss}" but the name must be exactly DATABASE_URL (capital letters). Add it again under that name in Vercel → Project → Settings → Environment Variables.`
    : "DATABASE_URL is not set. In Vercel → Project → Settings → Environment Variables, set\n  DATABASE_URL = mysql://USER:PASSWORD@HOST:3306/DATABASE\nwith the Hostinger MySQL details (hPanel → Databases → MySQL Databases), and allow remote access (hPanel → Remote MySQL).");
}
if (!/^(mysql|mariadb):\/\//i.test(raw)) {
  // Describe the shape without printing the value (it holds the password).
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw)?.[1];
  const shape = scheme ? `it starts with "${scheme}://"` : raw.includes("@") ? "it has no scheme (add mysql:// at the front)" : "it looks like a plain value, not a connection URL";
  fail(`DATABASE_URL must be a full URL starting with mysql:// — ${shape} (${raw.length} characters). Expected mysql://USER:PASSWORD@HOST:3306/DATABASE.`);
}

// The app parses the URL the same way (WHATWG URL), so an unencoded "@" in the password works; the migration tool
// gets the normalised form. A "#", "/" or "?" in the password must be percent-encoded.
let url: URL;
try {
  url = new URL(raw);
} catch {
  fail("DATABASE_URL is not a valid URL. Percent-encode special characters in the password (# → %23, / → %2F, ? → %3F).");
}
if (!url.hostname || !url.username || url.pathname.length < 2)
  fail(`DATABASE_URL is missing the ${!url.hostname ? "host" : !url.username ? "user" : "database name"}. Expected mysql://USER:PASSWORD@HOST:3306/DATABASE; percent-encode # / ? in the password.`);
console.log(`Database: ${url.username}@${url.hostname}:${url.port || 3306}${url.pathname}`);

const run = (cmd: string, env: NodeJS.ProcessEnv = process.env) => execSync(cmd, { stdio: "inherit", env });
run("npx tsx scripts/mysql-schema.ts --check");
const env = { ...process.env, DATABASE_URL: url.href, MYSQL_URL: url.href };
run("npx prisma migrate deploy --config prisma.mysql.config.ts", env);
run("npx next build", env);
