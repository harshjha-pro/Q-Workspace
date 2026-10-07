import { formatDate } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { EXPENSE_LABELS } from "@/server/services/hr/expenses";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

const TONE: Record<string, BadgeTone> = { PENDING: "amber", APPROVED: "blue", PAID: "green", REJECTED: "red" };
type Row = { id: string; date: string; kind: string; amountPaise: number; description: string; status: string; clientRecoverable: boolean; client: string; receiptDocId: string | null; claimant?: string; paidVia: string | null };

/** Claim rows with an optional per-row action slot. */
export function ClaimsTable({ rows, showClaimant, actions }: { rows: Row[]; showClaimant?: boolean; actions?: (r: Row) => React.ReactNode }) {
  if (rows.length === 0) return <p className="p-4 text-sm text-muted">No claims.</p>;
  return (
    <Table>
      <THead><tr>{showClaimant ? <TH>Claimant</TH> : null}<TH>Date</TH><TH>Claim</TH><TH className="text-right">Amount</TH><TH>Status</TH><TH /></tr></THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            {showClaimant ? <TD>{r.claimant}</TD> : null}
            <TD className="whitespace-nowrap">{formatDate(r.date)}</TD>
            <TD>
              {EXPENSE_LABELS[r.kind as keyof typeof EXPENSE_LABELS] ?? r.kind}{r.client ? ` · ${r.client}` : ""}
              <div className="text-xs text-muted">{r.description}{r.clientRecoverable ? " · client-recoverable" : ""}</div>
              {r.receiptDocId ? <a href={`/api/hr/download/receipt/${r.id}`} className="text-xs text-brand hover:underline">Receipt</a> : null}
            </TD>
            <TD className="text-right">{formatInr(r.amountPaise)}</TD>
            <TD><Badge tone={TONE[r.status] ?? "neutral"}>{r.status.toLowerCase()}</Badge>{r.paidVia ? <div className="text-xs text-muted">{r.paidVia === "PAYROLL" ? "with payroll" : "separately"}</div> : null}</TD>
            <TD>{actions?.(r)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
