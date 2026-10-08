import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/portal", label: "Home" },
  { href: "/portal/requests", label: "Send documents" },
  { href: "/portal/filings", label: "Filings" },
  { href: "/portal/documents", label: "Documents" },
  { href: "/portal/approvals", label: "Approvals" },
  { href: "/portal/agreements", label: "Proposals & letters" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/messages", label: "Messages" },
  { href: "/portal/account", label: "Account" },
];

/** A plain header and content column: client users see far fewer screens than staff, so no side menu. */
export function PortalShell({ name, logout, unread = 0, children }: { name: string; logout: () => Promise<void>; unread?: number; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/portal" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">Q</span>
            Client Portal
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted hover:text-ink">
                {n.label}{n.href === "/portal/messages" && unread ? <span className="ml-1 rounded-full bg-brand px-1.5 text-xs text-white">{unread}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted">{name}</span>
            <form action={logout}><Button type="submit" variant="ghost" size="sm">Sign out</Button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
