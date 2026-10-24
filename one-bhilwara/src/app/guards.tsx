import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import type { Role } from '@/types/models';
import { ROLES } from '@/config/catalog';
import { useSession } from '@/hooks/useStore';
import { Button, EmptyState, LinkButton } from '@/components/ui/primitives';
import { RoleDialog } from '@/layouts/AppShell';

/** Shows a sign-in prompt instead of private pages when signed out. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const loc = useLocation();
  if (userId) return <>{children}</>;
  return <EmptyState icon={<Lock className="size-6" aria-hidden />} title="Sign in required" text="This page shows your personal activity. Sign in (demo account) to continue." action={<LinkButton to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`}>Sign in</LinkButton>} />;
}

/**
 * Client-side role gate for the DEMO only. Production must enforce the same rule on the
 * server (row-level security / API authorisation); hiding UI is not security.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { role, userId } = useSession();
  const [open, setOpen] = useState(false);
  if (!userId) return <RequireAuth>{children}</RequireAuth>;
  if (roles.includes(role)) return <>{children}</>;
  const names = roles.map((r) => ROLES.find((x) => x.id === r)?.label).join(' or ');
  return (
    <>
      <EmptyState icon={<Lock className="size-6" aria-hidden />} title="Access restricted" text={`This area is for ${names} accounts. In this demo you can switch roles to explore it.`}
        action={<Button onClick={() => setOpen(true)}>Switch demo role</Button>} />
      <RoleDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
