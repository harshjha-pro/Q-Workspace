import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { todayIst } from "@/server/lib/dates";
import { getInvoice } from "@/server/services/billing/service";
import { PageHeader } from "@/components/ui/card";
import { billingClientOptions } from "../../../_lib";
import { InvoiceBuilder } from "../../invoice-builder";

export const metadata = { title: "Edit draft invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "billing.raise");
  const { id } = await params;
  const inv = await load(() => getInvoice(actor, id));
  if (inv.status !== "DRAFT") redirect(`/billing/invoices/${id}`);
  const clients = await billingClientOptions(actor, "billing.raise");
  return (
    <div>
      <PageHeader title="Edit draft invoice" subtitle={inv.client.name} />
      <InvoiceBuilder
        clients={clients}
        today={todayIst()}
        initial={{
          id: inv.id, clientId: inv.clientId, engagementId: inv.engagementId, date: inv.date, recipientGstin: inv.meta.recipientGstin ?? "", periodFrom: inv.meta.periodFrom ?? "",
          periodTo: inv.meta.periodTo ?? "", notes: inv.meta.text ?? "",
          lines: inv.lines.map((l) => ({ kind: l.kind, description: l.description, sac: l.sac, quantityMilli: l.quantityMilli, ratePaise: l.ratePaise, engagementId: l.engagementId, disbursementId: l.disbursementId })),
        }}
      />
    </div>
  );
}
