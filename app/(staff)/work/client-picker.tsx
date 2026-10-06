"use client";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type ClientOption = { id: string; name: string; code: string };

/** Type-to-filter client picker sized for a phone: a search box and up to 8 tappable matches. */
export function ClientPicker({ clients, value, onPick, onClear }: {
  clients: ClientOption[];
  value: ClientOption | null;
  onPick: (c: ClientOption) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clients.slice(0, 8);
    return clients.filter((c) => c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t)).slice(0, 8);
  }, [q, clients]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-brand-50 px-3 py-2 text-sm">
        <span><span className="font-medium">{value.name}</span> <span className="text-muted">{value.code}</span></span>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setQ(""); onClear(); }} aria-label="Change client">
          <X className="h-4 w-4" aria-hidden /> Change
        </Button>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
        <Input aria-label="Search client" placeholder="Search client by name or code" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" autoComplete="off" />
      </div>
      {clients.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No clients are assigned to you yet. Use Internal for non-client work.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line rounded-md border border-line bg-white">
          {matches.length === 0 ? <li className="px-3 py-2 text-sm text-muted">No match.</li> : null}
          {matches.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => onPick(c)}>
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">{c.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
