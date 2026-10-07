import { it, expect } from "vitest";
import { resetDb } from "../helpers/db";
import { db } from "@/server/lib/db";
import { seedDemo } from "@/prisma/seed/demo";
import { seedPayrollReference, seedPayrollDemo } from "@/prisma/seed/phase3/payroll";

it("seeds payroll demo", async () => {
  await resetDb();
  await seedPayrollReference(db());
  await seedPayrollReference(db());
  await seedDemo(db());
  const t0 = Date.now();
  await seedPayrollDemo();
  console.log("payroll demo ms", Date.now() - t0);
  const runs = await db().payrollRun.findMany({ orderBy: [{ month: "asc" }, { kind: "asc" }] });
  console.log(runs.map((r) => `${r.month} ${r.kind} ${r.status}`).join("\n"));
  const { getRun } = await import("@/server/services/payroll/runs");
  const hr = await db().user.findUniqueOrThrow({ where: { username: "lakshmi.narayanan" } });
  const r = await getRun({ kind: "USER", userId: hr.id, role: "HR_ADMIN", isSenior: false, displayName: "x" }, runs.find((x) => x.kind === "SALARY" && x.status === "LOCKED")!.id);
  for (const p of r.payslips) console.log(p.lines.employee.name, p.lines.attendance.usedLopHalfDays, p.gross, p.net, p.lines.result.tdsAmount, p.lines.result.pt);
  expect(runs.length).toBe(12);
}, 600000);
