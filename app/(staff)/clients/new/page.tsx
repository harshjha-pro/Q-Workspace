import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { PageHeader } from "@/components/ui/card";
import { clientFormOptions } from "@/lib/options";
import { ClientForm } from "../client-form";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  const actor = await requireStaff();
  requireCap(actor, "client.manage");
  const options = await clientFormOptions(actor);
  return (
    <div>
      <PageHeader title="New client" subtitle="A client code is assigned automatically." />
      <ClientForm options={options} />
    </div>
  );
}
