import { requireStaff, getSession } from "@/server/context";
import { db } from "@/server/lib/db";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, Alert } from "@/components/ui/card";
import { PasswordForm, TotpSetup } from "./forms";
import { formatDateTime } from "@/server/lib/dates";
import { MANDATORY_2FA_ROLES } from "@/server/domain/enums";
import Link from "next/link";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const actor = await requireStaff({ allowPending: true });
  const s = await getSession();
  const user = await db().user.findUniqueOrThrow({ where: { id: actor.userId } });
  const mandatory = MANDATORY_2FA_ROLES.includes(actor.role);
  return (
    <div className="space-y-4">
      <PageHeader title="Password and two-factor login" />
      {s?.mustChangePassword ? <Alert tone="warn">Please set your own password before continuing.</Alert> : null}
      {s?.needsTotpEnrolment ? <Alert tone="warn">Two-factor login is required for your role. Set it up to continue.</Alert> : null}
      {!s?.mustChangePassword && !s?.needsTotpEnrolment ? <Alert tone="success">Your account is ready. <Link className="underline" href="/">Go to Home</Link></Alert> : null}
      <Card>
        <CardHeader><CardTitle>Password</CardTitle></CardHeader>
        <CardContent><PasswordForm /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Two-factor login (authenticator app)</CardTitle>
          <span className="text-xs text-muted">{mandatory ? "Required for your role" : "Optional for your role"}</span>
        </CardHeader>
        <CardContent>
          {user.totpEnabled ? (
            <p className="text-sm">On since {formatDateTime(user.totpEnrolledAt)}. Lost your phone? Ask a Practice Admin or Partner to reset it.</p>
          ) : (
            <TotpSetup />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
