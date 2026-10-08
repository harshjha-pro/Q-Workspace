"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, LogOut } from "lucide-react";
import type { NavItem } from "./nav";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notifications/bell";

export function AppShell({
  nav, user, demo, logout, unread = 0, children,
}: {
  nav: NavItem[];
  user: { name: string; roleLabel: string };
  demo: boolean;
  logout: () => Promise<void>;
  unread?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const sections = [...new Set(nav.map((n) => n.section))];
  // Whole path segments only: "/me" must not light up on "/messages".
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  const navList = (
    <nav className="space-y-5 p-3 text-sm">
      {sections.map((s) => (
        <div key={s}>
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">{s}</p>
          {nav.filter((n) => n.section === s).map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
              className={cn("block rounded px-2 py-1.5 text-white/85 hover:bg-white/10", isActive(n.href) && "bg-white/15 text-white font-medium")}>
              {n.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="hidden bg-brand md:block">
        <div className="px-5 py-4 text-sm font-semibold text-white">QEPEX Work Tracker</div>
        {navList}
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-brand">
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <span className="text-sm font-semibold">QEPEX Work Tracker</span>
              <button aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            {navList}
          </aside>
        </div>
      ) : null}
      <div className="min-w-0">
        {demo ? <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900">Demo mode — sample data only. All PAN, GSTIN, DIN values are fake.</div> : null}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-2 backdrop-blur">
          <button className="md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <NotificationBell unread={unread} />
            <Link href="/me" className="text-right leading-tight">
              <span className="block font-medium">{user.name}</span>
              <span className="block text-xs text-muted">{user.roleLabel}</span>
            </Link>
            <form action={logout}>
              <button type="submit" className="rounded p-1.5 text-muted hover:bg-gray-100" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
