/** npm run seed — reference data (always) + demo firm (demo mode, empty DB). Same as the seed step of npm run setup. */
import "dotenv/config";
import { createPrisma } from "../../server/lib/db";
import { seedReference } from "./reference";
import { seedDemo } from "./demo";

const db = createPrisma(process.env.DATABASE_URL ?? "file:./prisma/data/qepex.db");
await seedReference(db);
if (process.env.DEMO_MODE === "true" && (await db.user.count({ where: { isSystem: false } })) === 0) await seedDemo(db);
await db.$disconnect();
console.log("Seed complete");
