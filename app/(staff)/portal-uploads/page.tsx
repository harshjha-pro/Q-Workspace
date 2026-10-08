import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { linkableItems, listPortalUploads } from "@/server/services/portal/uploads";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LinkDialog } from "./ui";
import { linkUploadAction } from "./actions";

export const metadata = { title: "Client uploads" };

const TABS = [["unlinked", "Not linked"], ["to-confirm", "To confirm"], ["all", "All"]] as const;

/** Portal uploads (P4-02) with keyword suggestions for unrequested files (D-85). */
export default async function PortalUploadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "portal.share");
  const raw = (await searchParams).status;
  const status = (TABS.find(([k]) => k === raw)?.[0] ?? "unlinked") as (typeof TABS)[number][0];
  const rows = await listPortalUploads(actor, { status });
  const options = new Map<string, { id: string; label: string }[]>();
  for (const cid of new Set(rows.filter((r) => !r.linkedTo).map((r) => r.clientId))) options.set(cid, await linkableItems(actor, cid));
  return (
    <div className="space-y-4">
      <PageHeader title="Client uploads" subtitle="Files clients sent through the portal. Unrequested files get a suggestion from keywords in the name and content; you decide." />
      <nav className="flex gap-2 text-sm">
        {TABS.map(([k, l]) => <Link key={k} href={`/portal-uploads?status=${k}`} className={`rounded-md px-3 py-1 ${k === status ? "bg-brand text-white" : "border border-line bg-white"}`}>{l}</Link>)}
      </nav>
      <Card>
        <Table>
          <THead><tr><TH>File</TH><TH>Client</TH><TH>For</TH><TH>Status</TH><TH /></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={5} className="text-sm text-muted">Nothing here.</TD></TR> : null}
            {rows.map((r) => {
              const items = options.get(r.clientId) ?? [];
              return (
                <TR key={r.id}>
                  <TD>
                    <a className="font-medium hover:underline" href={`/api/dms/${r.documentId}`}>{r.fileName}</a>
                    <div className="text-xs text-muted">{r.uploadedBy} · {formatDateTime(r.uploadedAt)}</div>
                    {r.tags.length ? <div className="mt-1 flex flex-wrap gap-1">{r.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> : null}
                  </TD>
                  <TD className="text-sm">{r.clientName}</TD>
                  <TD className="text-sm">
                    {r.linkedTo ? <>{r.linkedTo.label}{r.linkedTo.taskId ? <> · <Link className="underline" href={`/tasks/${r.linkedTo.taskId}`}>{r.linkedTo.task}</Link></> : null}</>
                      : r.suggested ? <span>Looks like: <span className="font-medium">{r.suggested.label}</span>{r.suggested.task ? ` (${r.suggested.task})` : ""}</span>
                      : <span className="text-muted">Not linked</span>}
                  </TD>
                  <TD>{r.confirmedAt ? <Badge tone="green">Confirmed{r.confirmedBy ? ` by ${r.confirmedBy}` : ""}</Badge> : r.linkedTo ? <Badge tone="amber">To confirm on task</Badge> : <Badge>Not linked</Badge>}</TD>
                  <TD>{!r.linkedTo && items.length ? <LinkDialog action={linkUploadAction.bind(null, r.id)} items={items} suggestedId={r.suggested?.id} trigger={r.suggested ? "Link as suggested" : "Link…"} /> : null}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
