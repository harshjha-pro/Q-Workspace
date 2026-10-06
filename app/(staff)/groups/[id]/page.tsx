import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/context";
import { groupView } from "@/server/services/dashboard/service";
import { load, requireCap } from "@/lib/page";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CONSTITUTION_LABELS, type Constitution } from "@/server/domain/enums";
import { cn } from "@/lib/utils";

export const metadata = { title: "Client group" };

/** groupView uses findUniqueOrThrow, which raises a Prisma P2025 (not a DomainError) for an unknown id. */
async function loadGroup(fn: () => ReturnType<typeof groupView>) {
  try {
    return await load(fn);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "P2025") notFound();
    throw e;
  }
}

function Count({ n, className, href }: { n: number; className?: string; href?: string }) {
  if (n === 0) return <span className="text-muted">0</span>;
  return href ? <Link href={href} className={cn("font-medium hover:underline", className)}>{n}</Link> : <span className={cn("font-medium", className)}>{n}</span>;
}

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  requireCap(actor, "client.view");
  const { group, clients } = await loadGroup(() => groupView(actor, id));
  const sum = (k: "open" | "overdue" | "filedLast30" | "pendingFromClient") => clients.reduce((a, c) => a + c[k], 0);

  return (
    <div className="space-y-4">
      <PageHeader title={group.name} subtitle={`Client group · ${clients.length} client${clients.length === 1 ? "" : "s"} you can see`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open tasks", n: sum("open"), cls: "" },
          { label: "Overdue", n: sum("overdue"), cls: "text-st-overdue" },
          { label: "Filed (last 30 days)", n: sum("filedLast30"), cls: "text-st-filed" },
          { label: "Pending from client", n: sum("pendingFromClient"), cls: "text-st-pending" },
        ].map((s) => (
          <Card key={s.label} className="p-3"><p className="text-xs text-muted">{s.label}</p><p className={cn("text-2xl font-semibold", s.n ? s.cls : "")}>{s.n}</p></Card>
        ))}
      </div>
      {clients.length === 0 ? <EmptyState title="No clients to show">None of this group&apos;s clients are in your scope.</EmptyState> : (
        <div className="rounded-lg border border-line bg-white">
          <Table>
            <THead><tr><TH>Client</TH><TH className="text-right">Open</TH><TH className="text-right">Overdue</TH><TH className="text-right">Filed 30d</TH><TH className="text-right">Pending from client</TH></tr></THead>
            <TBody>
              {clients.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    <p className="text-xs text-muted"><span className="font-mono">{c.code}</span> · {CONSTITUTION_LABELS[c.constitution as Constitution] ?? c.constitution}</p>
                  </TD>
                  <TD className="text-right"><Count n={c.open} href={`/tasks?mine=0&clientId=${c.id}`} /></TD>
                  <TD className="text-right"><Count n={c.overdue} className="text-st-overdue" href={`/tasks?mine=0&clientId=${c.id}`} /></TD>
                  <TD className="text-right"><Count n={c.filedLast30} className="text-st-filed" /></TD>
                  <TD className="text-right"><Count n={c.pendingFromClient} className="text-st-pending" href={`/tasks?mine=0&clientId=${c.id}&status=PENDING_FROM_CLIENT`} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
