import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld } from "../helpers/factory";
import { db } from "@/server/lib/db";
import type { PortalActor } from "@/server/permissions/actor";
import { listClients, getClient } from "@/server/services/clients/service";
import { listTasks, getTask } from "@/server/services/tasks/service";
import { listEngagements } from "@/server/services/engagements/service";
import { listInvoices, listReceipts } from "@/server/services/billing/service";
import { listUsers } from "@/server/services/users/service";
import { listNotices } from "@/server/services/registers/notices";
import { listLeads } from "@/server/services/crm/leads";
import { listProposals } from "@/server/services/crm/proposals";
import { listRuns } from "@/server/services/payroll/runs";
import { listCredentials } from "@/server/services/registers/vault";
import { listDocuments } from "@/server/services/dms/service";
import { listPortalUsers } from "@/server/services/portal/accounts";
import { listPortalUploads } from "@/server/services/portal/uploads";
import { listDue } from "@/server/services/reminders/due-lists";
import { responseStats } from "@/server/services/messages/service";

/**
 * Portal isolation (permissions invariant 7, D-86): a portal session that somehow reached a staff service must
 * never see another client's data, and internal registers must refuse it outright. Entry points are already
 * staff-only (authz-review.test.ts); this is the second wall.
 */
let w: Awaited<ReturnType<typeof buildWorld>>;
let portal: PortalActor;
let c2Task: string;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  portal = w.portal; // linked to c1 only
  c2Task = (await db().task.create({ data: { clientId: w.c2.id, title: "Other client's task" } })).id;
});

const refused = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow();
};

describe("portal session against staff services", () => {
  it("internal registers and firm data refuse a portal actor", async () => {
    await refused(listUsers(portal));
    await refused(listInvoices(portal));
    await refused(listReceipts(portal));
    await refused(listLeads(portal));
    await refused(listProposals(portal));
    await refused(listRuns(portal));
    await refused(listCredentials(portal, w.c1.id));
    await refused(listNotices(portal));
    await refused(listPortalUsers(portal));
    await refused(listPortalUploads(portal));
    await refused(listDue(portal, { kind: "CLIENT_DOCS" }));
    await refused(listDue(portal, { kind: "PAYMENT" }));
    await refused(responseStats(portal));
  });

  it("scoped reads never return another client's records", async () => {
    const clients = await listClients(portal).catch(() => null);
    if (clients) expect(JSON.stringify(clients)).not.toContain(w.c2.id);
    await refused(getClient(portal, w.c2.id));
    const tasks = await listTasks(portal).catch(() => null);
    if (tasks) expect(JSON.stringify(tasks)).not.toContain(w.c2.id);
    await refused(getTask(portal, c2Task));
    const engs = await listEngagements(portal).catch(() => null);
    if (engs) expect(JSON.stringify(engs)).not.toContain(w.e2.id);
    const docs = await listDocuments(portal, { clientId: w.c2.id }).catch(() => null);
    if (docs) expect(docs).toEqual([]);
  });
});
