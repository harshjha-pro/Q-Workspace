import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { formatDate } from "@/server/lib/dates";
import { getOpening, STAGE_LABELS, STAGES, type Stage } from "@/server/services/hr/recruitment";
import { canWrite } from "@/server/services/hr/common";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "../../../work/action-button";
import { AddCandidateDialog } from "../ui";
import { setOpeningStatusAction } from "../actions";

export const metadata = { title: "Opening" };

export default async function OpeningPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "recruitment.manage");
  const { id } = await params;
  const o = await load(() => getOpening(actor, id));
  const writer = canWrite(actor, "recruitment.manage");
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <p className="text-sm"><Link href="/hr/recruitment" className="text-brand hover:underline">← Recruitment</Link></p>
      <PageHeader
        title={o.title}
        subtitle={`${o.kind === "ARTICLE" ? "Article assistant" : "Staff"} · opened ${formatDate(o.openedAt)} · ${o.status.toLowerCase()}`}
        actions={writer ? (
          <>
            {o.status === "OPEN" ? <AddCandidateDialog openingId={o.id} /> : null}
            {o.status === "OPEN" ? <ActionButton action={setOpeningStatusAction.bind(null, o.id, "FILLED")} confirm="Mark this opening as filled?">Mark filled</ActionButton> : <ActionButton action={setOpeningStatusAction.bind(null, o.id, "OPEN")}>Reopen</ActionButton>}
          </>
        ) : null}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((s: Stage) => {
          const list = o.candidates.filter((c) => c.stage === s);
          return (
            <Card key={s}>
              <CardHeader><CardTitle>{STAGE_LABELS[s]}</CardTitle><Badge>{list.length}</Badge></CardHeader>
              <CardContent className="space-y-2 p-3">
                {list.length === 0 ? <p className="text-xs text-muted">—</p> : null}
                {list.map((c) => (
                  <Link key={c.id} href={`/hr/recruitment/candidates/${c.id}`} className="block rounded-md border border-line px-2 py-1.5 text-sm hover:bg-gray-50">
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-xs text-muted">{c.source || "—"} · {c.interviews.length} interview{c.interviews.length === 1 ? "" : "s"}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
