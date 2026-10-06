import type { Tx } from "./db";

/** Next human-readable code like CL-0042 / EN-00031, derived from the highest existing code. */
export async function nextCode(tx: Tx, kind: "client" | "engagement" | "group" | "employee"): Promise<string> {
  const cfg = {
    client: { prefix: "CL-", width: 4 },
    engagement: { prefix: "EN-", width: 5 },
    group: { prefix: "GR-", width: 3 },
    employee: { prefix: "EMP-", width: 4 },
  }[kind];
  const rows: { code: string }[] =
    kind === "client"
      ? await tx.client.findMany({ select: { code: true }, where: { code: { startsWith: cfg.prefix } } })
      : kind === "engagement"
        ? await tx.engagement.findMany({ select: { code: true }, where: { code: { startsWith: cfg.prefix } } })
        : kind === "group"
          ? await tx.clientGroup.findMany({ select: { code: true }, where: { code: { startsWith: cfg.prefix } } })
          : (await tx.employeeProfile.findMany({ select: { employeeCode: true } })).map((r) => ({ code: r.employeeCode }));
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(cfg.prefix.length)) || 0), 0);
  return `${cfg.prefix}${String(max + 1).padStart(cfg.width, "0")}`;
}

export const toSearch = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
