import { requireStaff } from "@/server/context";
import { AppShell } from "@/components/app-shell";
import { navFor } from "@/components/nav";
import { ROLE_LABELS } from "@/server/domain/enums";
import { isDemoMode } from "@/server/lib/env";
import { signOut } from "@/auth";
import { unreadCount } from "@/server/services/notifications/service";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff({ allowPending: true });
  const unread = await unreadCount(actor);
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  return (
    <AppShell nav={navFor(actor)} user={{ name: actor.displayName, roleLabel: actor.role === "STAFF" ? (actor.isSenior ? "Senior" : "Staff") : ROLE_LABELS[actor.role] }} demo={isDemoMode()} logout={logout} unread={unread}>
      {children}
    </AppShell>
  );
}
