import { requirePortal } from "@/server/context";
import { portalClients } from "@/server/services/portal/service";
import { PageHeader, Card } from "@/components/ui/card";

export const metadata = { title: "Client portal" };

export default async function PortalHome() {
  const actor = await requirePortal();
  const clients = await portalClients(actor);
  return (
    <div className="space-y-4">
      <PageHeader title={`Hello, ${actor.displayName}`} subtitle={clients.length > 1 ? "You have access to these entities." : "Your account with the firm."} />
      <div className="grid gap-3 sm:grid-cols-2">
        {clients.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="font-medium">{c.name}</div>
            <div className="text-xs text-muted">{c.code}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
