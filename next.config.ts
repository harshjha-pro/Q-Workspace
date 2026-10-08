import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Security headers (security checklist S-08, D-86). Everything is served from this server, so the policy only
 * allows 'self'. Next.js needs inline scripts for hydration ('unsafe-inline'), and dev mode also needs eval and
 * websockets for hot reload. Geolocation stays allowed for the attendance client-site check-in.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Invite links carry a token in the path: never send it to another site.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // libsql / exceljs / pino are server-only native-ish packages; keep them out of the bundle.
  serverExternalPackages: ["@libsql/client", "@prisma/adapter-libsql", "exceljs", "pino", "node-cron", "adm-zip", "bcryptjs", "pdfkit", "docx"],
  poweredByHeader: false,
  // Do not let Next write its own AGENTS.md / CLAUDE.md into the repo.
  agentRules: false,
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
