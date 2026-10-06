"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";

/** Client filter: changes the URL so the server page reloads with the filter (bookmarkable). */
export function ClientFilter({ clients, value }: { clients: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <Select aria-label="Filter by client" className="w-full sm:w-56" value={value}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set("client", e.target.value);
        else next.delete("client");
        router.push(`/calendar?${next.toString()}`);
      }}>
      <option value="">All clients</option>
      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  );
}
