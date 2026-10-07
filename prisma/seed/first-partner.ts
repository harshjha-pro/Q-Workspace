import type { PrismaClient } from "../../generated/prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

/** Real (non-demo) install: one Partner account to start with; everything else is created in the app. */
export async function createFirstPartner(db: PrismaClient) {
  const password = `Tmp-${randomBytes(6).toString("base64url")}9`;
  await db.user.create({
    data: {
      username: "partner",
      displayName: "Partner",
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
      role: "PARTNER",
      searchName: "partner",
    },
  });
  // QEPEX India's office is in Rajasthan (Q-31); the rest of the profile is filled in by the Partner.
  if ((await db.firmProfile.count()) === 0) await db.firmProfile.create({ data: { name: "QEPEX India", stateCode: "RJ", createdById: "system" } });
  return { username: "partner", password };
}
