import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/permissions/**/*.test.ts", "tests/migration/**/*.test.ts", "tests/compliance-scenarios/**/*.test.ts", "tests/payroll-golden/**/*.test.ts"],
    environment: "node",
    fileParallelism: false, // integration tests share one temp SQLite file per worker setup
    testTimeout: 30000,
    hookTimeout: 120000,
    setupFiles: ["tests/setup-env.ts"],
    globalSetup: ["tests/global-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      thresholds: { "server/compliance-engine/**": { branches: 100, functions: 100, lines: 100, statements: 100 } },
    },
  },
});
