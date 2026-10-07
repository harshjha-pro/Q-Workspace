import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { listLetters, policyStatus, LETTER_EXTRA_FIELDS, LETTER_KINDS, LETTER_LABELS, POLICY_KINDS, POLICY_LABELS, type LetterKind } from "@/server/services/hr/letters";
import { namesOf } from "@/server/services/hr/common";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "../../work/action-button";
import { peopleOptions } from "../../registers/_lib/pickers";
import { LetterDialog, PolicyDialog } from "./ui";
import { issueLetterAction } from "./actions";

export const metadata = { title: "HR letters & policies" };

export default async function LettersPage() {
  const actor = await requireStaff();
  requireCap(actor, "hr.records.manage");
  const today = todayIst();
  const [letters, policies, people] = await Promise.all([load(() => listLetters(actor)), load(() => policyStatus(actor)), peopleOptions()]);
  const names = await namesOf(letters.map((l) => l.userId));
  const kinds = LETTER_KINDS.filter((k) => k !== "OFFER").map((k) => ({ kind: k, label: LETTER_LABELS[k], fields: LETTER_EXTRA_FIELDS[k] }));
  const policyKinds = POLICY_KINDS.map((k) => [k, POLICY_LABELS[k]] as [string, string]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="HR letters & policies" subtitle="Appointment, confirmation, increment, experience and relieving letters from templates; the policy library with acknowledgments. Offer letters are made from the candidate in Recruitment." actions={<LetterDialog people={people} kinds={kinds} />} />
      <Card>
        <CardHeader><CardTitle>Letters</CardTitle></CardHeader>
        {letters.length === 0 ? <p className="p-4 text-sm text-muted">No letters yet.</p> : (
          <Table>
            <THead><tr><TH>Person</TH><TH>Letter</TH><TH>Status</TH><TH /></tr></THead>
            <TBody>
              {letters.map((l) => (
                <TR key={l.id}>
                  <TD>{names.get(l.userId) ?? ""}</TD>
                  <TD>{LETTER_LABELS[l.kind as LetterKind] ?? l.kind}<div className="text-xs text-muted">{formatDateTime(l.createdAt)}{l.templateVersionId ? " · firm template" : " · built-in default"}</div></TD>
                  <TD>{l.issuedAt ? <Badge tone="green">Issued {formatDate(l.issuedAt.toISOString().slice(0, 10))}</Badge> : <Badge tone="amber">Draft</Badge>}</TD>
                  <TD>
                    <span className="flex flex-wrap justify-end gap-1">
                      <a className={buttonVariants({ size: "sm", variant: "secondary" })} href={`/api/hr/download/letter/${l.id}?format=pdf`}>PDF</a>
                      <a className={buttonVariants({ size: "sm", variant: "ghost" })} href={`/api/hr/download/letter/${l.id}?format=docx`}>Word</a>
                      {!l.issuedAt ? <ActionButton action={issueLetterAction.bind(null, l.id)}>Mark issued</ActionButton> : null}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader><CardTitle>Policy library</CardTitle><PolicyDialog today={today} kinds={policyKinds} /></CardHeader>
        <CardContent>
          {policies.length === 0 ? <p className="text-sm text-muted">No policies yet.</p> : (
            <ul className="divide-y divide-line">
              {policies.map((p) => (
                <li key={p.id} className="space-y-1 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{p.title} <span className="font-normal text-muted">· {POLICY_LABELS[p.kind as keyof typeof POLICY_LABELS] ?? p.kind} · v{p.version} · from {formatDate(p.effectiveFrom)}</span></span>
                    <PolicyDialog today={today} kinds={policyKinds} current={p} />
                  </div>
                  {p.requiresAck ? <p className="text-muted">{p.acknowledged} acknowledged{p.outstanding.length ? ` · waiting for: ${p.outstanding.join(", ")}` : " · everyone has acknowledged"}</p> : <p className="text-muted">No acknowledgment asked (placeholder or information only).</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
