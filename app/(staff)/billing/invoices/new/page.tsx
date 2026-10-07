import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { todayIst } from "@/server/lib/dates";
import { PageHeader } from "@/components/ui/card";
import { billingClientOptions } from "../../_lib";
import { InvoiceBuilder } from "../invoice-builder";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ clientId?: string; engagementId?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "billing.raise");
  const sp = await searchParams;
  const clients = await billingClientOptions(actor, "billing.raise");
  return (
    <div>
      <PageHeader title="New invoice" subtitle="Saved as a draft. The invoice number is allocated only when it is issued, so the series has no gaps." />
      <InvoiceBuilder clients={clients} defaultClientId={sp.clientId} defaultEngagementId={sp.engagementId} today={todayIst()} />
    </div>
  );
}
