"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { clientStatusTone } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { CONSTITUTION_LABELS, type Constitution } from "@/server/domain/enums";

export type ClientRow = {
  id: string; code: string; name: string; constitution: string; status: string; pan: string | null; category: string | null;
  group: string | null; partner: string | null; manager: string | null; team: string | null; gstins: number; engagements: number;
};


const columns: ColumnDef<ClientRow, unknown>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Client", cell: ({ row }) => <Link className="font-medium text-brand hover:underline" href={`/clients/${row.original.id}`}>{row.original.name}</Link> },
  { accessorKey: "constitution", header: "Constitution", cell: ({ getValue }) => CONSTITUTION_LABELS[getValue() as Constitution] },
  { accessorKey: "pan", header: "PAN", cell: ({ getValue }) => <span className="font-mono text-xs">{(getValue() as string) ?? "—"}</span> },
  { accessorKey: "group", header: "Group", cell: ({ getValue }) => (getValue() as string) ?? "—" },
  { accessorKey: "manager", header: "Manager", cell: ({ getValue }) => (getValue() as string) ?? "—" },
  { accessorKey: "gstins", header: "GSTINs" },
  { accessorKey: "engagements", header: "Engagements" },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <Badge tone={clientStatusTone(getValue() as string)}>{String(getValue()).toLowerCase()}</Badge> },
];

export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  return <DataTable columns={columns} data={rows} searchPlaceholder="Filter by name, PAN, group…" empty="No clients match." />;
}
