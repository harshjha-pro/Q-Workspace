"use client";
import { useState } from "react";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Sortable, filterable table used by every list page (list → filters → detail → actions, brief §10). */
export function DataTable<T>({ columns, data, searchPlaceholder = "Filter…", empty = "Nothing to show." }: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  searchPlaceholder?: string;
  empty?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  const table = useReactTable({
    data, columns, state: { sorting, globalFilter: filter }, onSortingChange: setSorting, onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(),
  });
  return (
    <div className="space-y-2">
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={searchPlaceholder} className="max-w-xs" aria-label="Filter rows" />
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 font-medium">
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button className="inline-flex items-center gap-1" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-line">
            {table.getRowModel().rows.length === 0 ? (
              <tr><td className="px-3 py-6 text-center text-muted" colSpan={columns.length}>{empty}</td></tr>
            ) : (
              table.getRowModel().rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/70">
                  {r.getVisibleCells().map((c) => <td key={c.id} className="px-3 py-2 align-top">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{table.getFilteredRowModel().rows.length} of {data.length}</p>
    </div>
  );
}
