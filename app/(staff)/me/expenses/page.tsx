import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { formatDate, todayIst } from "@/server/lib/dates";
import { conveyanceSuggestions, listConveyanceRates, myClaims } from "@/server/services/hr/expenses";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ActionButton } from "../../work/action-button";
import { clientOptions } from "../../registers/_lib/pickers";
import { can } from "@/server/permissions/guards";
import { ClaimsTable } from "../../hr/expenses/claims-table";
import { ClaimDialog } from "../../hr/expenses/ui";
import { cancelClaimAction } from "../../hr/expenses/actions";

export const metadata = { title: "Expense claims" };

export default async function MyExpensesPage() {
  const actor = await requireStaff();
  requireCap(actor, "expense.claim");
  const today = todayIst();
  const [claims, suggestions, rateRows, clients] = await Promise.all([
    load(() => myClaims(actor)), load(() => conveyanceSuggestions(actor, today)), listConveyanceRates(),
    can(actor, "client.view") ? clientOptions(actor, "client.view") : Promise.resolve([]),
  ]);
  // Latest rate per mode for the form hint.
  const rates: Record<string, number> = {};
  for (const r of rateRows) if (r.effectiveFrom <= today && rates[r.mode] === undefined) rates[r.mode] = r.ratePaise;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Expense claims" subtitle="Conveyance, travel and other expenses. Paid with payroll or separately once approved." actions={<ClaimDialog today={today} clients={clients} rates={rates} />} />
      {suggestions.length ? (
        <Card>
          <CardHeader><CardTitle>Client visits not yet claimed</CardTitle><span className="text-xs text-muted">From your Client Site work entries</span></CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {suggestions.map((s) => (
                <li key={`${s.date}-${s.clientId}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>{formatDate(s.date)} · {s.client || "Client site"}</span>
                  <ClaimDialog today={today} clients={clients} rates={rates} trigger="Claim" prefill={{ date: s.date, clientId: clients.some((c) => c.id === s.clientId) ? s.clientId : null, workEntryId: s.workEntryIds[0]!, label: `${formatDate(s.date)} ${s.client}` }} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>My claims</CardTitle></CardHeader>
        <ClaimsTable rows={claims} actions={(r) => (r.status === "PENDING" ? <ActionButton action={cancelClaimAction.bind(null, r.id)} variant="ghost" confirm="Withdraw this claim?">Withdraw</ActionButton> : null)} />
      </Card>
    </div>
  );
}
