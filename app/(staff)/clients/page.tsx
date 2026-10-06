import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listClients, listGroups } from "@/server/services/clients/service";
import { can } from "@/server/permissions/guards";
import { PageHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ClientsTable, type ClientRow } from "./clients-table";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ status?: string; group?: string }> }) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const [clients, groups] = await Promise.all([listClients(actor, { status: sp.status, groupId: sp.group }), listGroups(actor)]);
  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id, code: c.code, name: c.name, constitution: c.constitution, status: c.status, pan: c.pan, category: c.category,
    group: c.group?.name ?? null, partner: c.partner?.displayName ?? null, manager: c.manager?.displayName ?? null, team: c.team?.name ?? null,
    gstins: c._count.gstins, engagements: c._count.engagements,
  }));
  const chip = (label: string, href: string, active: boolean) => (
    <Link key={href} href={href} className={`rounded-full border px-3 py-1 text-xs ${active ? "border-brand bg-brand-50 text-brand" : "border-line bg-white text-muted"}`}>{label}</Link>
  );
  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Client master — the anchor for engagements, compliance and billing."
        actions={can(actor, "client.manage") ? <Link href="/clients/new" className={buttonVariants()}>New client</Link> : null}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {chip("Active & dormant", "/clients", !sp.status && !sp.group)}
        {chip("Active", "/clients?status=ACTIVE", sp.status === "ACTIVE")}
        {chip("Dormant", "/clients?status=DORMANT", sp.status === "DORMANT")}
        {chip("Discontinued", "/clients?status=DISCONTINUED", sp.status === "DISCONTINUED")}
        {groups.map((g) => chip(g.name, `/clients?group=${g.id}`, sp.group === g.id))}
      </div>
      <ClientsTable rows={rows} />
    </div>
  );
}
