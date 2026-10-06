import { requireStaff } from "@/server/context";
import { AppShell } from "@/components/app-shell";
import { navFor } from "@/components/nav";
import { ROLE_LABELS } from "@/server/domain/enums";
import { isDemoMode } from "@/server/lib/env";
import { signOut } from "@/auth";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff({ allowPending: true });
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  return (
    <AppShell nav={navFor(actor)} user={{ name: actor.displayName, roleLabel: `${ROLE_LABELS[actor.role]}${actor.isSenior ? " (Senior)" : ""}` }} demo={isDemoMode()} logout={logout}>
      {children}
    </AppShell>
  );
}
