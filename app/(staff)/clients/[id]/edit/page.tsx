import { requireStaff } from "@/server/context";
import { getClient } from "@/server/services/clients/service";
import { load } from "@/lib/page";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/card";
import { clientFormOptions } from "@/lib/options";
import { ClientForm } from "../../client-form";

export const metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  const { client: c, canManage } = await load(() => getClient(actor, id));
  if (!canManage) redirect("/denied");
  const options = await clientFormOptions(actor);
  return (
    <div>
      <PageHeader title={`Edit ${c.name}`} subtitle="Applicability flags, GSTINs and directors are changed from the client page, with an effective date." />
      <ClientForm
        clientId={c.id}
        options={options}
        initial={{
          name: c.name, constitution: c.constitution as never, groupId: c.groupId ?? "", pan: c.pan ?? "", tan: c.tan ?? "", cinLlpin: c.cinLlpin ?? "",
          udyam: c.udyam ?? "", stateCode: c.stateCode ?? "", address: c.address, incorporationDate: c.incorporationDate ?? "", fyEnd: c.fyEnd,
          booksBy: c.booksBy as never, partnerId: c.partnerId ?? "", managerId: c.managerId ?? "", teamId: c.teamId ?? "", category: (c.category ?? "") as never,
          tags: c.tags, publicInterest: c.publicInterest, leadSource: c.leadSource ?? "", onboardingDate: c.onboardingDate ?? "",
          kycStatus: c.kycStatus as never, preferredChannel: c.preferredChannel as never,
        }}
      />
    </div>
  );
}
