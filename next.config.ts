import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libsql / exceljs / pino are server-only native-ish packages; keep them out of the bundle.
  serverExternalPackages: ["@libsql/client", "@prisma/adapter-libsql", "exceljs", "pino", "node-cron", "adm-zip", "bcryptjs"],
  poweredByHeader: false,
  // Do not let Next write its own AGENTS.md / CLAUDE.md into the repo.
  agentRules: false,
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
};

export default nextConfig;
