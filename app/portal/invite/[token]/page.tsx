import { inviteInfo } from "@/server/services/portal/accounts";
import { AuthCard } from "../../_ui/auth-card";
import { SetPasswordForm } from "./form";
import { acceptInviteAction } from "./actions";

export const metadata = { title: "Set your portal password" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await inviteInfo(token);
  if (!info) {
    return (
      <AuthCard title="This link is no longer valid" subtitle="It may have expired, been used already, or been replaced by a newer link.">
        <p className="text-sm">Ask the firm to send you a new invite link.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={info.firstTime ? `Welcome, ${info.name}` : "Set a new password"} subtitle={`For ${info.email}. This link works once.`}>
      <SetPasswordForm action={acceptInviteAction.bind(null, token)} email={info.email} />
    </AuthCard>
  );
}
