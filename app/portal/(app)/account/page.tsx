import { requirePortal, getSession } from "@/server/context";
import { portalAccount } from "@/server/services/portal/accounts";
import { PageHeader, Card, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PortalTotpDisable, PortalTotpSetup } from "./forms";

export const metadata = { title: "Your account" };

export default async function PortalAccountPage() {
  const actor = await requirePortal({ allowPending: true });
  const pending = (await getSession())?.needsTotpEnrolment;
  const a = await portalAccount(actor);
  return (
    <div className="space-y-4">
      <PageHeader title="Your account" subtitle={a.email} />
      {pending ? <Alert tone="warn">The firm requires two-factor login for the portal. Set it up to continue.</Alert> : null}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Two-factor login</h2>
          {a.totpEnabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}
        </div>
        <p className="text-sm text-muted">A 6-digit code from an app on your phone, asked after your password.</p>
        {a.totpEnabled ? (a.mandatory ? <p className="text-sm text-muted">Required by the firm.</p> : <PortalTotpDisable />) : <PortalTotpSetup />}
      </Card>
      <Card className="space-y-1 p-4">
        <h2 className="font-medium">Password</h2>
        <p className="text-sm text-muted">To change or reset your password, ask the firm for a new invite link. Opening it signs you out of other devices.</p>
      </Card>
    </div>
  );
}
