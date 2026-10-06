"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { engagementStatusTone } from "@/components/status";
import { SERVICE_LINE_LABELS, FEE_BASIS_LABELS, type ServiceLine } from "@/server/domain/enums";
import { formatInr, formatMinutes } from "@/server/lib/money";

export type EngagementRow = {
  id: string; code: string; name: string; client: string; clientId: string; serviceLine: string; recurrence: string; feeBasis: string;
  feePaise: number | null; budgetMinutes: number; status: string; team: string;
};

export function EngagementsTable({ rows, showFees }: { rows: EngagementRow[]; showFees: boolean }) {
  const columns: ColumnDef<EngagementRow, unknown>[] = [
    { accessorKey: "code", header: "Code" },
    { accessorKey: "name", header: "Engagement", cell: ({ row }) => <Link className="font-medium text-brand hover:underline" href={`/engagements/${row.original.id}`}>{row.original.name}</Link> },
    { accessorKey: "client", header: "Client", cell: ({ row }) => <Link className="hover:underline" href={`/clients/${row.original.clientId}`}>{row.original.client}</Link> },
    { accessorKey: "serviceLine", header: "Service line", cell: ({ getValue }) => SERVICE_LINE_LABELS[getValue() as ServiceLine] },
    { accessorKey: "recurrence", header: "Type", cell: ({ getValue }) => (getValue() === "RECURRING" ? "Recurring" : "One-time") },
    { accessorKey: "budgetMinutes", header: "Budget", cell: ({ getValue }) => ((getValue() as number) ? formatMinutes(getValue() as number) : "—") },
    ...(showFees
      ? [{ accessorKey: "feePaise", header: "Fee", cell: ({ row }) => (row.original.feePaise ? `${formatInr(row.original.feePaise)} · ${FEE_BASIS_LABELS[row.original.feeBasis as "FIXED"]}` : FEE_BASIS_LABELS[row.original.feeBasis as "FIXED"]) } as ColumnDef<EngagementRow, unknown>]
      : []),
    { accessorKey: "team", header: "Team" },
    { accessorKey: "status", header: "Status", cell: ({ getValue }) => <Badge tone={engagementStatusTone(getValue() as string)}>{String(getValue()).toLowerCase().replace("_", " ")}</Badge> },
  ];
  return <DataTable columns={columns} data={rows} searchPlaceholder="Filter engagements…" empty="No engagements. Allocations Pending?" />;
}
