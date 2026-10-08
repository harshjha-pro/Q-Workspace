import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { listSchedules, listComplianceTypeOptions } from "@/server/services/reminders/due-lists";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ScheduleDialog } from "../ui";
import { saveScheduleAction } from "../actions";

export const metadata = { title: "Reminder schedules" };

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function SchedulesPage() {
  const actor = await requireStaff();
  requireCap(actor, "settings.manage");
  const [rows, types] = await Promise.all([listSchedules(actor), listComplianceTypeOptions(actor)]);
  const typeName = new Map(types.map((t) => [t.code, t.name]));
  return (
    <div className="space-y-4">
      <PageHeader title="Reminder schedules" subtitle={<><Link className="hover:underline" href="/reminders">Reminders due</Link> · When client-document reminders are put on the list. These are the firm&apos;s own habits; the seeded ones are placeholders.</>} actions={<ScheduleDialog action={saveScheduleAction.bind(null, null)} types={types} />} />
      <Card>
        <Table>
          <THead><tr><TH>Schedule</TH><TH>Type</TH><TH>When</TH><TH>Escalate after</TH><TH /></tr></THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id} className={s.active ? undefined : "opacity-60"}>
                <TD className="font-medium">{s.name}{s.active ? null : <Badge className="ml-1">Inactive</Badge>}{s.messageText ? <Badge className="ml-1">Own text</Badge> : null}</TD>
                <TD className="text-sm">{s.complianceTypeCode ? (typeName.get(s.complianceTypeCode) ?? s.complianceTypeCode) : "Any"}</TD>
                <TD className="text-sm">Day {s.dayOfMonth} of {s.monthsCsv ? s.monthsCsv.split(",").map((m) => MONTHS[Number(m)]).join(", ") : "every month"}</TD>
                <TD className="text-sm">{s.escalateAfter} reminders</TD>
                <TD><ScheduleDialog action={saveScheduleAction.bind(null, s.id)} d={s} types={types} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
