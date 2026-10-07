import { it, expect } from "vitest";
import { resetDb } from "../helpers/db";
import { db } from "@/server/lib/db";
import { seedDemo } from "@/prisma/seed/demo";
import { seedCrmDemo } from "@/prisma/seed/phase3/crm";

it("CRM demo seed runs on the demo firm", async () => {
  await resetDb();
  await seedDemo(db());
  await seedCrmDemo();
  expect(await db().lead.count()).toBeGreaterThanOrEqual(19);
  expect(await db().proposal.count()).toBeGreaterThanOrEqual(6);
  expect(await db().engagementLetter.count({ where: { status: "SIGNED_UPLOADED" } })).toBe(1);
  expect(await db().opportunity.count()).toBeGreaterThan(0);
  expect(await db().renewal.count()).toBe(5);
  expect(await db().feedback.count({ where: { rating: { lte: 2 } } })).toBe(1);
  expect(await db().campaignRecipient.count()).toBeGreaterThan(0);
  await seedCrmDemo(); // idempotent
  expect(await db().lead.count()).toBeGreaterThanOrEqual(19);
}, 600_000);
