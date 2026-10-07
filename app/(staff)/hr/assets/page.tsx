import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { formatDate, todayIst } from "@/server/lib/dates";
import { listAssets, ASSET_LABELS } from "@/server/services/hr/assets";
import { canWrite } from "@/server/services/hr/common";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "../../work/action-button";
import { peopleOptions } from "../../registers/_lib/pickers";
import { IssueDialog, NewAssetDialog, ReturnDialog } from "./ui";
import { retireAssetAction } from "./actions";

export const metadata = { title: "Assets" };

export default async function AssetsPage() {
  const actor = await requireStaff();
  requireCap(actor, "assets.manage");
  const rows = await load(() => listAssets(actor));
  const writer = canWrite(actor, "assets.manage");
  const people = writer ? await peopleOptions() : [];
  const today = todayIst();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Firm assets" subtitle="Laptops, phones, dongles and other assets: who holds what, since when, and in what condition. Held assets appear in the exit checklist." actions={writer ? <NewAssetDialog /> : null} />
      {rows.length === 0 ? <EmptyState title="No assets recorded" /> : (
        <Card>
          <Table>
            <THead><tr><TH>Asset</TH><TH>Held by</TH><TH>Condition</TH><TH /></tr></THead>
            <TBody>
              {rows.map((a) => (
                <TR key={a.id}>
                  <TD><span className="font-medium">{a.tag}</span><div className="text-xs text-muted">{ASSET_LABELS[a.kind as keyof typeof ASSET_LABELS] ?? a.kind}{a.description ? ` · ${a.description}` : ""}{a.serial ? ` · ${a.serial}` : ""}</div></TD>
                  <TD>{a.holder ? <>{a.holder.name}<div className="text-xs text-muted">since {formatDate(a.holder.issuedAt)}</div></> : <Badge tone={a.status === "RETIRED" ? "neutral" : "green"}>{a.status === "RETIRED" ? "retired" : "in stock"}</Badge>}</TD>
                  <TD>{a.condition.toLowerCase()}</TD>
                  <TD>
                    {writer ? (
                      <span className="flex flex-wrap justify-end gap-1">
                        {a.holder ? <ReturnDialog assetId={a.id} tag={a.tag} today={today} /> : a.status !== "RETIRED" ? <><IssueDialog assetId={a.id} tag={a.tag} people={people} today={today} /><ActionButton action={retireAssetAction.bind(null, a.id)} variant="ghost" confirm={`Retire ${a.tag}?`}>Retire</ActionButton></> : null}
                      </span>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
