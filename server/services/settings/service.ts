import { db, transaction } from "../../lib/db";
import { SETTING_DEFAULTS, type SettingKey } from "./registry";
import type { Actor } from "../../permissions/actor";
import { authorize } from "../../permissions/guards";
import { writeAudit } from "../../audit";
import { DomainError } from "../../lib/errors";

export async function getSetting<T = unknown>(key: SettingKey | string, fallback?: T): Promise<T> {
  const row = await db().setting.findUnique({ where: { key } });
  if (row) return JSON.parse(row.valueJson) as T;
  const def = (SETTING_DEFAULTS as Record<string, { value: unknown }>)[key];
  return (def ? def.value : fallback) as T;
}

export async function getSettingNumber(key: SettingKey, fallback: number): Promise<number> {
  const v = await getSetting<unknown>(key, fallback);
  return typeof v === "number" ? v : fallback;
}

export async function listSettings() {
  const rows = await db().setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return Object.entries(SETTING_DEFAULTS).map(([key, def]) => {
    const row = byKey.get(key);
    return { key, description: def.description, value: row ? (JSON.parse(row.valueJson) as unknown) : def.value, isDefault: !row };
  });
}

export async function updateSetting(actor: Actor, key: string, value: unknown) {
  authorize(actor, "settings.manage");
  const def = (SETTING_DEFAULTS as Record<string, { value: unknown }>)[key];
  if (!def) throw new DomainError("VALIDATION", `Unknown setting ${key}`);
  if (typeof def.value !== typeof value || Array.isArray(def.value) !== Array.isArray(value)) {
    throw new DomainError("VALIDATION", `Setting ${key} expects a ${Array.isArray(def.value) ? "list" : typeof def.value}`);
  }
  return transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key } });
    const row = await tx.setting.upsert({
      where: { key },
      create: { key, valueJson: JSON.stringify(value), description: (def as { description?: string }).description ?? "" },
      update: { valueJson: JSON.stringify(value) },
    });
    await writeAudit(tx, actor, {
      entityType: "Setting",
      entityId: key,
      action: "UPDATE",
      before: { value: before ? JSON.parse(before.valueJson) : def.value },
      after: { value },
    });
    return row;
  });
}
