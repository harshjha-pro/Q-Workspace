/**
 * Vercel build (web deployment, D-98): check the MySQL schema mirror, apply pending MySQL migrations to the
 * Hostinger database (migrate deploy — never a reset), then build Next.js.
 */
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
if (!/^(mysql|mariadb):\/\//i.test(url)) {
  console.error("\nDATABASE_URL is not set to a MySQL database. In Vercel → Project → Settings → Environment Variables, set\n  DATABASE_URL = mysql://USER:PASSWORD@HOST:3306/DATABASE\nwith the Hostinger MySQL details (hPanel → Databases → MySQL Databases), and allow remote access (hPanel → Remote MySQL).\n");
  process.exit(1);
}
const run = (cmd: string, env: NodeJS.ProcessEnv = process.env) => execSync(cmd, { stdio: "inherit", env });
run("npx tsx scripts/mysql-schema.ts --check");
run("npx prisma migrate deploy --config prisma.mysql.config.ts", { ...process.env, MYSQL_URL: url });
run("npx next build");
