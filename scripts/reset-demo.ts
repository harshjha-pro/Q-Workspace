/** npm run demo:reset — wipe and reload the demo firm. Refuses unless DEMO_MODE=true. */
import "dotenv/config";
import { resetDemoData } from "../server/services/system/demo";

if (process.env.DEMO_MODE !== "true") {
  console.error("Refusing: DEMO_MODE is not true. Demo reset never runs on real firm data.");
  process.exit(1);
}
await resetDemoData();
console.log("Demo data reset.");
process.exit(0);
