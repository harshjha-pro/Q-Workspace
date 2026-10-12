import "dotenv/config";
import { defineConfig } from "prisma/config";

/** MySQL/MariaDB variant for the web deployment (Hostinger MySQL, D-98). The SQLite config stays the default. */
export default defineConfig({
  schema: "prisma/mysql/schema",
  migrations: { path: "prisma/mysql/migrations" },
  datasource: { url: process.env.MYSQL_URL ?? process.env.DATABASE_URL ?? "mysql://localhost:3306/qepex" },
});
