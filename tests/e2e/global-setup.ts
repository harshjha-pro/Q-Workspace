import { execSync } from "node:child_process";

/** E2E flows change data (approve, file, reassign), so each run starts from a fresh demo firm. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET === "true") return;
  execSync("npm run demo:reset", { stdio: "inherit" });
}
