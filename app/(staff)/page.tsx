import Link from "next/link";
import { requireStaff } from "@/server/context";
import { db } from "@/server/lib/db";
import { authorize, can } from "@/server/permissions/guards";
import { clientWhere, engagementWhere } from "@/server/permissions/scopes";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SERVICE_LINE_LABELS, type ServiceLine } from "@/server/domain/enums";
import { formatDate, todayIst } from "@/server/lib/dates";

export const metadata = { title: "Home" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const actor = await requireStaff();
  const mine = await db().engagement.findMany({
    where: { status: "ACTIVE", assignments: { some: { userId: actor.userId, toDate: null } } },
    include: { client: { select: { name: true, code: true } }, assignments: { where: { userId: actor.userId, toDate: null }, select: { role: true } } },
    orderBy: { name: "asc" },
    take: 12,
  });
  const scopeCounts = can(actor, "client.view")
    ? {
        clients: await db().client.count({ where: { AND: [clientWhere(actor, authorize(actor, "client.view")), { isFirm: false, status: { not: "DISCONTINUED_CLOSED" } }] } }),
        engagements: await db().engagement.count({ where: { AND: [engagementWhere(actor, authorize(actor, "engagement.view")), { status: "ACTIVE" }] } }),
      }
    : null;
  const isMakerRole = actor.role === "STAFF" || actor.role === "ARTICLE";

  return (
    <div className="space-y-4">
      <PageHeader title={`${greeting()}, ${actor.displayName.split(" ")[0]}`} subtitle={formatDate(todayIst())} />
      {scopeCounts ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><CardContent><p className="text-xs text-muted">Clients you can see</p><p className="text-2xl font-semibold">{scopeCounts.clients}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-muted">Active engagements</p><p className="text-2xl font-semibold">{scopeCounts.engagements}</p></CardContent></Card>
        </div>
      ) : null}
      <Card>
        <CardHeader><CardTitle>My engagements</CardTitle></CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            isMakerRole ? (
              <EmptyState title="Allocations Pending">Your Manager has not assigned you to any engagement yet. You will see your clients and work here once they do.</EmptyState>
            ) : (
              <p className="text-sm text-muted">You are not assigned to any engagement as maker or checker.</p>
            )
          ) : (
            <ul className="divide-y divide-line">
              {mine.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/engagements/${e.id}`} className="font-medium hover:underline">{e.name}</Link>
                  <span className="flex items-center gap-2 text-muted">
                    {e.client.name}
                    <Badge tone="brand">{SERVICE_LINE_LABELS[e.serviceLine as ServiceLine]}</Badge>
                    {e.assignments.map((a) => <Badge key={a.role}>{a.role.toLowerCase()}</Badge>)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted">Daily work entry, due dates and the task list arrive in Phase 2.</p>
    </div>
  );
}
