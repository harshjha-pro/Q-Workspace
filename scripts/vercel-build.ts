/**
 * Vercel build (web deployment, D-98): check the MySQL schema mirror, apply pending MySQL migrations to the
 * Hostinger database (migrate deploy — never a reset), then build Next.js.
 */
import { execSync } from "node:child_process";
import { resolveDatabaseUrl } from "../server/lib/database-url";

function fail(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

const raw = resolveDatabaseUrl() ?? "";
const fromParts = !!(process.env.DB_HOST || process.env.DB_USER || process.env.DB_NAME);
if (!raw) {
  const nearMiss = Object.keys(process.env).find((k) => k !== "DATABASE_URL" && k.toUpperCase() === "DATABASE_URL");
  fail(nearMiss
    ? `Found "${nearMiss}" but the name must be exactly DATABASE_URL (capital letters). Add it again under that name in Vercel → Project → Settings → Environment Variables.`
    : "No database settings. In Vercel → Project → Settings → Environment Variables add DB_HOST, DB_USER, DB_PASSWORD and DB_NAME (Hostinger hPanel → Databases → MySQL Databases), or one DATABASE_URL.\nAllow remote access in hPanel → Databases → Remote MySQL (Any Host).");
}
if (fromParts && !(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME))
  fail(`Missing ${["DB_HOST", "DB_USER", "DB_NAME"].filter((k) => !process.env[k]?.trim()).join(", ")} in Vercel → Settings → Environment Variables.`);
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
importDemoFiles().then(() => run("npx next build", env), (e) => fail(`Demo file import failed: ${e instanceof Error ? e.message : e}`));

/**
 * One-time demo setup (D-99): the demo firm's documents (made-up data, prisma/seed/web-demo-files) are copied into
 * the private Blob store while DEMO_MODE and DEMO_FILE_IMPORT are both "true". Remove DEMO_FILE_IMPORT afterwards.
 */
async function importDemoFiles() {
  if (process.env.DEMO_MODE !== "true" || process.env.DEMO_FILE_IMPORT !== "true") return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) fail("DEMO_FILE_IMPORT is on but the Blob store is not connected (BLOB_READ_WRITE_TOKEN).");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { put } = await import("@vercel/blob");
  const root = path.resolve("prisma/seed/web-demo-files");
  const files = (await fs.readdir(root, { recursive: true, withFileTypes: true })).filter((d) => d.isFile());
  const types: Record<string, string> = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip: "application/zip", png: "image/png", jpg: "image/jpeg", csv: "text/csv", txt: "text/plain" };
  for (const d of files) {
    const abs = path.join(d.parentPath, d.name);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    await put(rel, await fs.readFile(abs), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: types[path.extname(rel).slice(1).toLowerCase()] ?? "application/octet-stream" });
  }
  console.log(`Demo files copied to Blob storage: ${files.length}`);
}
