/** npm run db:stats — row counts of the main tables (quick check after setup or import). */
import "dotenv/config";
import { createPrisma } from "../server/lib/db";

const db = createPrisma(process.env.DATABASE_URL ?? "file:./prisma/data/qepex.db");
const byRole = await db.user.groupBy({ by: ["role"], where: { isSystem: false }, _count: true });
const byConstitution = await db.client.groupBy({ by: ["constitution"], where: { isFirm: false }, _count: true });
console.table({
  people: await db.user.count({ where: { isSystem: false } }),
  clients: await db.client.count({ where: { isFirm: false } }),
  groups: await db.clientGroup.count(),
  gstins: await db.gSTIN.count(),
  directors: await db.director.count(),
  engagements: await db.engagement.count(),
  ptRegistrations: await db.clientPtRegistration.count(),
  employeeProfiles: await db.employeeProfile.count(),
});
console.log("Roles:", byRole.map((r) => `${r.role}=${r._count}`).join(", "));
console.log("Constitutions:", byConstitution.map((r) => `${r.constitution}=${r._count}`).join(", "));
await db.$disconnect();
