import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { load } from "@/lib/page";
import { applaudablePeople, BADGES, listBadges, myApplause } from "@/server/services/applause/service";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GiveApplauseDialog } from "./give-dialog";

export const metadata = { title: "Applause" };

type Row = Awaited<ReturnType<typeof myApplause>>["received"][number];

function List({ rows, who }: { rows: Row[]; who: "from" | "to" }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="space-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {r.badgeName ? <Badge tone="violet">{r.badgeName}</Badge> : null}
            <span className="text-sm font-medium">{who === "from" ? `From ${r.fromName}` : `To ${r.toName}`}</span>
            <span className="text-xs text-muted">{formatDateTime(r.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{r.message}</p>
        </li>
      ))}
    </ul>
  );
}

/** Applause (spec 7.3): what I received, and what I sent. Deliberately no leaderboard, totals or ranking. */
export default async function ApplausePage() {
  const actor = await requireStaff();
  const canGive = can(actor, "applause.give");
  const [mine, people, badgeRows] = await Promise.all([
    load(() => myApplause(actor)),
    canGive ? load(() => applaudablePeople(actor)) : Promise.resolve([]),
    listBadges(),
  ]);
  const badges = badgeRows.length ? badgeRows.map((b) => ({ code: b.code, name: b.name, description: b.description })) : BADGES.map((b) => ({ ...b }));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Applause"
        subtitle="Recognition from Partners and Managers. It appears in your appraisal file as supporting evidence."
        actions={canGive ? <GiveApplauseDialog people={people.map((p) => ({ id: p.id, name: p.displayName }))} badges={badges} /> : null}
      />
      <Card>
        <CardHeader><CardTitle>Received</CardTitle></CardHeader>
        {mine.received.length ? <List rows={mine.received} who="from" /> : <EmptyState title="No applause yet">When a Partner or Manager applauds your work it shows here.</EmptyState>}
      </Card>
      {canGive ? (
        <Card>
          <CardHeader><CardTitle>Sent by you</CardTitle><span className="text-xs text-muted">Applause cannot be edited or withdrawn.</span></CardHeader>
          {mine.sent.length ? <List rows={mine.sent} who="to" /> : <EmptyState title="Nothing sent yet" />}
        </Card>
      ) : null}
    </div>
  );
}
