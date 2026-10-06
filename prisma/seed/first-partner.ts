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
  return { username: "partner", password };
}
