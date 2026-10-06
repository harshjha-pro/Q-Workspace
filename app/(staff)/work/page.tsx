import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { db } from "@/server/lib/db";
import { authorize, can } from "@/server/permissions/guards";
import { clientWhere } from "@/server/permissions/scopes";
import { LOCATIONS, LOCATION_LABELS } from "@/server/domain/enums";
import { addDays, formatDate, formatDateTime, isIsoDate, todayIst, weekStart } from "@/server/lib/dates";
import * as work from "@/server/services/work/service";
import { PageHeader, Alert } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { OfflineSync } from "@/components/offline/offline-sync";
import { AddWorkForm } from "./add-work-form";
import { EntriesList, type EntryRow } from "./entries-list";
import { OUTCOME_LABELS } from "./format";

export const metadata = { title: "Add work" };

export default async function AddWorkPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "work.log");
  const sp = await searchParams;
  const today = todayIst();
  const date = sp.date && isIsoDate(sp.date) && sp.date <= today ? sp.date : today;
  const ws = weekStart(today);
  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(ws, i)).filter((d) => d <= today);

  const [user, missing, recent, clients, categories, chips, timer, entries, locked, lockAt] = await Promise.all([
    db().user.findUniqueOrThrow({ where: { id: actor.userId }, select: { defaultLocation: true, locationChangeable: true } }),
    work.missingDays(actor.userId, today),
    load(() => work.recentPairs(actor)),
    can(actor, "client.view")
      ? db().client.findMany({ where: { AND: [clientWhere(actor, authorize(actor, "client.view")), { status: { not: "DISCONTINUED_CLOSED" } }] }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    db().internalCategory.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db().descriptionChip.findMany({ where: { active: true }, select: { label: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    load(() => work.activeTimer(actor)),
    load(() => work.entriesFor(actor, actor.userId, date, date)),
    work.isLocked(actor.userId, date),
    work.lockMomentFor(date),
  ]);

  const pending = entries.length
    ? new Set((await db().correctionRequest.findMany({ where: { workEntryId: { in: entries.map((e) => e.id) }, status: "PENDING" }, select: { workEntryId: true } })).map((c) => c.workEntryId))
    : new Set<string>();

  let timerLabel = "";
  if (timer) {
    const [c, e, t] = await Promise.all([
      timer.clientId ? db().client.findUnique({ where: { id: timer.clientId }, select: { name: true } }) : null,
      timer.engagementId ? db().engagement.findUnique({ where: { id: timer.engagementId }, select: { name: true } }) : null,
      timer.taskId ? db().task.findUnique({ where: { id: timer.taskId }, select: { title: true } }) : null,
    ]);
    timerLabel = [c?.name, t?.title ?? e?.name].filter(Boolean).join(" · ");
  }

  const rows: EntryRow[] = entries.map((e) => ({
    id: e.id,
    title: e.internalCategory?.name ?? e.client?.name ?? "—",
    sub: e.internalCategory ? "Internal" : [e.task?.title ?? e.engagement?.name, e.stageName].filter(Boolean).join(" · "),
    minutes: e.minutes,
    description: e.description,
    chips: e.chips ? e.chips.split(",").filter(Boolean) : [],
    location: e.location,
    outcome: e.outcomeType ? `${OUTCOME_LABELS[e.outcomeType as keyof typeof OUTCOME_LABELS] ?? e.outcomeType}${e.outcomeRef ? ` ${e.outcomeRef}` : ""}` : null,
    pendingCorrection: pending.has(e.id),
  }));

  const banner = work.missingBanner(missing);
  const missingLinks = missing.slice(-6);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Add work"
        subtitle={formatDate(today)}
        actions={<Link href="/work/week" className={buttonVariants({ variant: "secondary", size: "sm" })}><CalendarDays className="h-4 w-4" aria-hidden /> My week</Link>}
      />

      {banner ? (
        <Alert tone="warn">
          <p>{banner}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {missingLinks.map((d) => (
              <Link key={d} href={`/work?date=${d}`} className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100">
                Fill {formatDate(d)}
              </Link>
            ))}
          </div>
        </Alert>
      ) : null}

      <OfflineSync />

      <AddWorkForm
        today={today}
        yesterday={addDays(today, -1)}
        initialDate={date}
        weekDays={weekDays}
        clients={clients}
        categories={categories}
        chips={chips.map((c) => c.label)}
        recent={recent}
        location={{ value: user.defaultLocation, changeable: user.locationChangeable, options: LOCATIONS.map((l) => ({ value: l, label: LOCATION_LABELS[l] })) }}
        timer={timer ? { startedAt: timer.startedAt.toISOString(), label: timerLabel } : null}
      />

      <EntriesList date={date} today={today} entries={rows} locked={locked} lockLabel={`Editable until ${formatDateTime(lockAt)}`} />
    </div>
  );
}

