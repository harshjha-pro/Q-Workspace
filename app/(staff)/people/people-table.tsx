"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

export type PersonRow = { id: string; name: string; username: string; role: string; designation: string; manager: string; twoFactor: boolean; active: boolean; lastLogin: string };

const columns: ColumnDef<PersonRow, unknown>[] = [
  { accessorKey: "name", header: "Name", cell: ({ row }) => <Link href={`/people/${row.original.id}`} className="font-medium text-brand hover:underline">{row.original.name}</Link> },
  { accessorKey: "username", header: "Username", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
  { accessorKey: "role", header: "Role" },
  { accessorKey: "designation", header: "Designation" },
  { accessorKey: "manager", header: "Reports to" },
  { accessorKey: "twoFactor", header: "2FA", cell: ({ getValue }) => (getValue() ? <Badge tone="green">on</Badge> : <Badge>off</Badge>) },
  { accessorKey: "lastLogin", header: "Last login" },
  { accessorKey: "active", header: "Status", cell: ({ getValue }) => (getValue() ? <Badge tone="green">active</Badge> : <Badge tone="red">inactive</Badge>) },
];

export function PeopleTable({ rows }: { rows: PersonRow[] }) {
  return <DataTable columns={columns} data={rows} searchPlaceholder="Filter people…" />;
}
