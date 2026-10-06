import { db } from "@/server/lib/db";
import type { Actor } from "@/server/permissions/actor";
import { listAllGroupsForPicker, listStates } from "@/server/services/clients/service";
import { listUserOptions } from "@/server/services/users/service";

/** Picker options for client forms (server-side). */
export async function clientFormOptions(actor: Actor) {
  const [groups, states, people, teams] = await Promise.all([
    listAllGroupsForPicker(actor),
    listStates(),
    listUserOptions(actor, ["PARTNER", "MANAGER"]),
    db().clientTeam.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    states: states.map((s) => ({ code: s.code, name: s.name, ptLevied: s.ptLevied })),
    partners: people.filter((p) => p.role === "PARTNER").map((p) => ({ id: p.id, name: p.displayName })),
    managers: people.map((p) => ({ id: p.id, name: p.displayName })),
    teams,
  };
}
