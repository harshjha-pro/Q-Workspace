import { requirePortal } from "@/server/context";
import { signOut } from "@/auth";
import { PortalShell } from "../_ui/portal-shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePortal({ allowPending: true });
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/portal/login" });
  }
  return <PortalShell name={actor.displayName} logout={logout}>{children}</PortalShell>;
}
