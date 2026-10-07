import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listLeads } from "@/server/services/crm/leads";
import { can } from "@/server/permissions/guards";
import { requireCap } from "@/lib/page";
import { formatDate, todayIst } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LeadDialog } from "../_ui/lead-forms";
import { createLeadAction } from "../actions";
import { clientOptions, ownerOptions } from "../_lib/pickers";
import { STAGES, STAGE_TONE } from "../_lib/labels";
import { canSeeFees } from "@/server/services/crm/common";

export const metadata = { title: "Leads" };

const PIPELINE = ["NEW", "CONTACTED", "MEETING", "PROPOSAL_SENT", "ON_HOLD"] as const;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; owner?: string; stage?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "crm.view");
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "pipeline";
  const rows = await listLeads(actor, { q: sp.q, ownerId: sp.owner || undefined, stage: view === "list" ? sp.stage || undefined : undefined });
  const manage = can(actor, "crm.manage");
  const fees = canSeeFees(actor);
  const [owners, clients] = manage ? await Promise.all([ownerOptions(), clientOptions(actor, "crm.view")]) : [[], []];
  const today = todayIst();
  const stageLabel = new Map<string, string>(STAGES);
  const qs = (v: string) => `/crm/leads?view=${v}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${sp.owner ? `&owner=${sp.owner}` : ""}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        subtitle="Enquiries from first contact to signed engagement."
        actions={
          <>
            {manage ? <LeadDialog trigger="New lead" title="New lead" action={createLeadAction} owners={owners} clients={clients} showFee={fees} /> : null}
            {fees ? <Link href="/crm/templates" className={buttonVariants({ variant: "secondary", size: "sm" })}>Service templates</Link> : null}
          </>
        }
      />
      <form className="flex flex-wrap items-end gap-2" action="/crm/leads">
        <input type="hidden" name="view" value={view} />
        <Input name="q" defaultValue={sp.q} placeholder="Search name, PAN, email…" className="w-full sm:w-64" />
        {owners.length ? (
          <Select name="owner" defaultValue={sp.owner ?? ""} className="w-full sm:w-48"><option value="">All owners</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        ) : null}
        {view === "list" ? (
          <Select name="stage" defaultValue={sp.stage ?? ""} className="w-full sm:w-40"><option value="">All stages</option>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        ) : null}
        <Button type="submit" size="sm" variant="secondary">Filter</Button>
        <div className="ml-auto flex gap-1">
          <Link href={qs("pipeline")} className={buttonVariants({ size: "sm", variant: view === "pipeline" ? "default" : "secondary" })}>Pipeline</Link>
          <Link href={qs("list")} className={buttonVariants({ size: "sm", variant: view === "list" ? "default" : "secondary" })}>List</Link>
        </div>
      </form>

      {view === "pipeline" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((stage) => {
            const col = rows.filter((r) => r.stage === stage);
            return (
              <Card key={stage} className="min-w-0">
                <CardHeader className="py-2">
                  <CardTitle>{stageLabel.get(stage)}</CardTitle>
                  <span className="text-xs text-muted">{col.length}{fees && col.length ? ` · ${formatInr(col.reduce((s, r) => s + r.estFeePaise, 0))}` : ""}</span>
                </CardHeader>
                <CardContent className="space-y-2 p-2">
                  {col.length === 0 ? <p className="px-1 py-2 text-xs text-muted">None</p> : null}
                  {col.map((r) => (
                    <Link key={r.id} href={`/crm/leads/${r.id}`} className="block rounded-md border border-line bg-white p-2 text-sm hover:bg-gray-50">
                      <div className="font-medium text-ink">{r.name}</div>
                      <div className="text-xs text-muted">{r.ownerName || "No owner"}{fees && r.estFeePaise ? ` · ${formatInr(r.estFeePaise)}` : ""}</div>
                      {r.nextFollowUp ? (
                        <div className={`mt-1 text-xs ${r.nextFollowUp < today ? "text-red-700" : r.nextFollowUp === today ? "text-amber-800" : "text-muted"}`}>
                          Follow up {r.nextFollowUp === today ? "today" : formatDate(r.nextFollowUp)}
                        </div>
                      ) : null}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <THead><tr><TH>Lead</TH><TH>Stage</TH><TH>Owner</TH><TH>Source</TH>{fees ? <TH className="text-right">Est. fee</TH> : null}<TH>Follow-up</TH></tr></THead>
            <TBody>
              {rows.length === 0 ? <TR><TD colSpan={6} className="py-6 text-center text-muted">No leads.</TD></TR> : null}
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/crm/leads/${r.id}`} className="font-medium hover:underline">{r.name}</Link>{r.contactName ? <div className="text-xs text-muted">{r.contactName}</div> : null}</TD>
                  <TD><Badge tone={STAGE_TONE[r.stage] ?? "neutral"}>{stageLabel.get(r.stage) ?? r.stage}</Badge></TD>
                  <TD className="text-sm">{r.ownerName}</TD>
                  <TD className="text-xs text-muted">{r.source.replace(/_/g, " ").toLowerCase()}</TD>
                  {fees ? <TD className="text-right tabular-nums">{r.estFeePaise ? formatInr(r.estFeePaise) : "—"}</TD> : null}
                  <TD className="whitespace-nowrap text-sm">{r.nextFollowUp ? formatDate(r.nextFollowUp) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
