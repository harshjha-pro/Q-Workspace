"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/server/lib/dates";
import { AUTHORITY_LABELS, NOTICE_STATUS_LABELS, NOTICE_STATUS_TONE, dueTone } from "./labels";

export type NoticeRow = {
  id: string; authority: string; section: string; ay: string; client: string; clientId: string; received: string; due: string;
  dueDays: number | null; nextHearing: string; status: string; referenceNo: string;
};

function Due({ row }: { row: NoticeRow }) {
  if (!row.due) return <span className="text-muted">—</span>;
  const tone = dueTone(row.dueDays);
  const cls = tone === "red" ? "font-medium text-red-700" : tone === "amber" ? "font-medium text-amber-700" : "";
  const hint = row.dueDays === null ? "" : row.dueDays < 0 ? `${-row.dueDays} days late` : row.dueDays === 0 ? "today" : `in ${row.dueDays} days`;
  return <span className={cls}>{formatDate(row.due)}{hint ? <span className="block text-xs">{hint}</span> : null}</span>;
}

export function NoticesTable({ rows }: { rows: NoticeRow[] }) {
  const columns: ColumnDef<NoticeRow, unknown>[] = [
    { accessorKey: "authority", header: "Authority", cell: ({ row }) => (
      <Link className="font-medium text-brand hover:underline" href={`/notices/${row.original.id}`}>{AUTHORITY_LABELS[row.original.authority] ?? row.original.authority}</Link>
    ) },
    { accessorKey: "section", header: "Section", cell: ({ getValue }) => (getValue() ? `u/s ${String(getValue())}` : "—") },
    { accessorKey: "ay", header: "AY / period" },
    { accessorKey: "client", header: "Client", cell: ({ row }) => <Link className="hover:underline" href={`/clients/${row.original.clientId}`}>{row.original.client}</Link> },
    { accessorKey: "received", header: "Received", cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorKey: "due", header: "Response due", cell: ({ row }) => <Due row={row.original} /> },
    { accessorKey: "nextHearing", header: "Next hearing", cell: ({ getValue }) => (getValue() ? formatDate(getValue() as string) : "—") },
    { accessorKey: "status", header: "Status", cell: ({ getValue }) => <Badge tone={NOTICE_STATUS_TONE[getValue() as string] ?? "neutral"}>{NOTICE_STATUS_LABELS[getValue() as string] ?? String(getValue())}</Badge> },
  ];
  return <DataTable columns={columns} data={rows} searchPlaceholder="Filter notices…" empty="No notices match." />;
}
