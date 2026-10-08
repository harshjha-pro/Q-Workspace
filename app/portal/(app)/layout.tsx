import { requirePortal } from "@/server/context";
import { signOut } from "@/auth";
import { PortalShell } from "../_ui/portal-shell";
import { unreadThreads } from "@/server/services/messages/service";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePortal({ allowPending: true });
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/portal/login" });
  }
  const unread = await unreadThreads(actor);
  return <PortalShell name={actor.displayName} logout={logout} unread={unread}>{children}</PortalShell>;
}
