import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { meetingFormOptions } from "@/server/services/meetings/service";
import { todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScheduleForm } from "./schedule-form";

export const metadata = { title: "Schedule meeting" };

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "meetings.manage");
  const { clientId } = await searchParams;
  const opts = await load(() => meetingFormOptions(actor, clientId || undefined));
  const client = clientId ? opts.clients.find((c) => c.id === clientId) : undefined;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Schedule a client meeting" subtitle={<Link href="/meetings" className="underline">Back to meetings</Link>} />
      <Card>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-2">
            <Field label="Client *" className="min-w-0 flex-1">
              <Select name="clientId" defaultValue={clientId ?? ""} required>
                <option value="" disabled>Choose…</option>
                {opts.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="secondary">{client ? "Change" : "Next"}</Button>
          </form>
          {client ? <ScheduleForm clientId={client.id} today={todayIst()} people={opts.people} contacts={opts.contacts} engagements={opts.engagements} me={actor.userId} /> : <p className="text-sm text-muted">Choose the client first; their contacts and engagements are then listed.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
