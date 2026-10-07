import { requirePortal } from "@/server/context";
import { portalClients, portalRequests } from "@/server/services/portal/service";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadForm } from "../../_ui/forms";
import { uploadAction } from "../actions";

export const metadata = { title: "Send documents" };

export default async function RequestsPage() {
  const actor = await requirePortal();
  const [requests, clients] = await Promise.all([portalRequests(actor), portalClients(actor)]);
  const multi = clients.length > 1;
  return (
    <div className="space-y-4">
      <PageHeader title="Send documents" subtitle="What the firm has asked for. Upload each file here; the firm checks it and confirms." />
      {requests.length === 0 ? <Card className="p-4 text-sm text-muted">Nothing is requested right now.</Card> : null}
      {requests.map((r) => (
        <Card key={r.id}>
          <CardHeader>
            <CardTitle>{r.label}</CardTitle>
            {r.uploaded ? <Badge tone="blue">Uploaded — being checked</Badge> : <Badge tone="amber">Requested{r.requestedOn ? ` ${formatDate(r.requestedOn)}` : ""}</Badge>}
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted">For {r.forWhat}{multi ? ` · ${r.clientName}` : ""}{r.dueDate ? ` · due ${formatDate(r.dueDate)}` : ""}</p>
            <UploadForm action={uploadAction} clientId={r.clientId} checklistItemId={r.id} />
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader><CardTitle>Send something else</CardTitle></CardHeader>
        <CardContent><UploadForm action={uploadAction} clients={clients} clientId={multi ? undefined : clients[0]?.id} /></CardContent>
      </Card>
    </div>
  );
}
