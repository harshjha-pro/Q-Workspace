import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listServiceTemplates } from "@/server/services/crm/templates";
import { canSeeFees } from "@/server/services/crm/common";
import { scopeOf } from "@/server/permissions/guards";
import { requireCap } from "@/lib/page";
import { redirect } from "next/navigation";
import { formatInr } from "@/server/lib/money";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { TemplateDialog } from "../_ui/template-forms";
import { saveTemplateAction } from "../actions";
import { FEE_BASES, SERVICE_LINES } from "../_lib/labels";

export const metadata = { title: "Service templates" };

export default async function TemplatesPage() {
  const actor = await requireStaff();
  requireCap(actor, "crm.view");
  if (!canSeeFees(actor)) redirect("/denied");
  const admin = scopeOf(actor, "crm.manage") === "firm";
  const rows = await listServiceTemplates(actor, { includeInactive: admin });
  const label = (list: readonly (readonly [string, string])[], v: string) => list.find(([k]) => k === v)?.[1] ?? v;

  return (
    <div className="space-y-4">
      <PageHeader title="Service templates" subtitle={<><Link className="hover:underline" href="/crm/leads">Leads</Link> · Building blocks for proposals. Fees and effort figures are the firm&apos;s own placeholders.</>} actions={admin ? <TemplateDialog action={saveTemplateAction.bind(null, null)} /> : null} />
      <Card>
        <Table>
          <THead><tr><TH>Template</TH><TH>Service line</TH><TH>Fee basis</TH><TH className="text-right">Default fee</TH><TH /></tr></THead>
          <TBody>
            {rows.map((t) => (
              <TR key={t.id} className={t.active ? undefined : "opacity-60"}>
                <TD><div className="font-medium">{t.name}</div><div className="line-clamp-2 max-w-md text-xs text-muted">{t.scope}</div></TD>
                <TD className="text-sm">{label(SERVICE_LINES, t.serviceLine)}</TD>
                <TD className="text-sm">{label(FEE_BASES, t.feeBasis)}{t.active ? null : <Badge className="ml-1">Inactive</Badge>}</TD>
                <TD className="text-right tabular-nums">{formatInr(t.defaultFeePaise)}{t.feeBasis === "TIME" ? "/hr" : ""}</TD>
                <TD>{admin ? <TemplateDialog action={saveTemplateAction.bind(null, t.id)} d={t} /> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
