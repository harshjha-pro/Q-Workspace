import { execSync } from "node:child_process";

/** E2E flows change data (approve, file, reassign), so each run starts from a fresh demo firm. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET !== "true") execSync("npm run demo:reset", { stdio: "inherit" });
  // Work-entry flows log today's work; keep the week open if the Sunday-evening lock has passed.
  execSync("npx tsx tests/e2e/open-week.ts", { stdio: "inherit" });
}
