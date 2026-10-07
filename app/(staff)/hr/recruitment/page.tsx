import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { formatDate, todayIst } from "@/server/lib/dates";
import { listOpenings, openOnboarding, STAGE_LABELS, STAGES } from "@/server/services/hr/recruitment";
import { canWrite, namesOf } from "@/server/services/hr/common";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { peopleOptions } from "../../registers/_lib/pickers";
import { NewOpeningDialog } from "./ui";

export const metadata = { title: "Recruitment" };

export default async function RecruitmentPage() {
  const actor = await requireStaff();
  requireCap(actor, "recruitment.manage");
  const [openings, onboarding] = await Promise.all([load(() => listOpenings(actor)), load(() => openOnboarding(actor))]);
  const writer = canWrite(actor, "recruitment.manage");
  const owners = writer ? await peopleOptions(["PARTNER", "MANAGER", "HR_ADMIN"]) : [];
  const names = await namesOf([...openings.map((o) => o.ownerId), ...onboarding.map((i) => i.userId)]);
  const byPerson = new Map<string, typeof onboarding>();
  for (const i of onboarding) byPerson.set(i.userId, [...(byPerson.get(i.userId) ?? []), i]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Recruitment" subtitle="Openings for staff and article assistants, the candidate pipeline and onboarding." actions={writer ? <NewOpeningDialog today={todayIst()} owners={owners} /> : null} />
      {openings.length === 0 ? <EmptyState title="No openings yet">Create an opening to start adding candidates.</EmptyState> : (
        <Card>
          <Table>
            <THead><tr><TH>Opening</TH><TH>Pipeline</TH><TH>Status</TH></tr></THead>
            <TBody>
              {openings.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/hr/recruitment/${o.id}`} className="font-medium text-brand hover:underline">{o.title}</Link>
                    <div className="text-xs text-muted">{o.kind === "ARTICLE" ? "Article assistant" : "Staff"} · opened {formatDate(o.openedAt)}{o.ownerId ? ` · ${names.get(o.ownerId) ?? ""}` : ""}</div>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {STAGES.filter((s) => o.counts[s]).map((s) => <Badge key={s} tone={s === "JOINED" ? "green" : s === "REJECTED" ? "red" : s === "OFFER" ? "violet" : "neutral"}>{STAGE_LABELS[s]} {o.counts[s]}</Badge>)}
                      {o.candidates.length === 0 ? <span className="text-xs text-muted">No candidates</span> : null}
                    </div>
                  </TD>
                  <TD><Badge tone={o.status === "OPEN" ? "blue" : "neutral"}>{o.status.toLowerCase()}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Onboarding in progress</CardTitle><Link href="/people/new" className="text-sm text-brand hover:underline">Create a login in People</Link></CardHeader>
        <CardContent>
          {byPerson.size === 0 ? <p className="text-sm text-muted">No open onboarding checklists.</p> : (
            <ul className="divide-y divide-line">
              {[...byPerson.entries()].map(([userId, items]) => (
                <li key={userId} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{names.get(userId) ?? ""}</span>
                  <span className="text-muted">{items.length} step{items.length === 1 ? "" : "s"} open: {items.map((i) => i.label).join("; ")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
