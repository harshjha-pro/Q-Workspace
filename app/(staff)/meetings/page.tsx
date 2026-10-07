import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { listMeetings, meetingFormOptions } from "@/server/services/meetings/service";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEETING_STATUS_LABELS, MEETING_STATUS_TONE } from "./labels";

export const metadata = { title: "Client meetings" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ when?: string; clientId?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "meetings.manage");
  const sp = await searchParams;
  const when = sp.when === "past" ? "past" : "upcoming";
  const [rows, opts] = await Promise.all([load(() => listMeetings(actor, { when, clientId: sp.clientId || undefined })), load(() => meetingFormOptions(actor))]);
  const qs = (w: string) => `/meetings?when=${w}${sp.clientId ? `&clientId=${sp.clientId}` : ""}`;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Client meetings" subtitle="Schedule meetings, record minutes, and turn action items into tasks." actions={<Link href={`/meetings/new${sp.clientId ? `?clientId=${sp.clientId}` : ""}`} className={buttonVariants({ size: "sm" })}>Schedule meeting</Link>} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex gap-1 border-b border-line" aria-label="When">
          {([["upcoming", "Upcoming"], ["past", "Past"]] as const).map(([k, l]) => (
            <Link key={k} href={qs(k)} aria-current={when === k ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", when === k ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>{l}</Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="when" value={when} />
          <Select name="clientId" defaultValue={sp.clientId ?? ""} aria-label="Client" className="max-w-[16rem]">
            <option value="">All clients</option>
            {opts.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button type="submit" variant="secondary" size="sm">Filter</Button>
        </form>
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState title={when === "past" ? "No past meetings" : "No upcoming meetings"} /> : (
          <ul className="divide-y divide-line">
            {rows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="w-32 shrink-0 text-sm font-medium">{formatDate(m.scheduledAt.slice(0, 10))} <span className="text-muted">{m.scheduledAt.slice(11)}</span></span>
                <Link href={`/meetings/${m.id}`} className="font-medium text-brand hover:underline">{m.title}</Link>
                <span className="text-sm text-muted">{m.clientName}</span>
                <Badge tone={MEETING_STATUS_TONE[m.status] ?? "neutral"}>{MEETING_STATUS_LABELS[m.status] ?? m.status}</Badge>
                {m.hasMinutes ? <Badge tone="green">Minutes</Badge> : null}
                {m.actionItems ? <span className="text-xs text-muted">{m.actionItems} action item{m.actionItems === 1 ? "" : "s"}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
