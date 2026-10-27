import { BookOpen, Columns2, Compass, Home, RefreshCw, ScanText, User, WifiOff } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { SearchBar } from './SearchBar';
import { cx } from './ui';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="30" fill="#1C4A31" />
      <circle cx="29" cy="29" r="14" fill="none" stroke="#FAF8F3" strokeWidth="4" />
      <path d="M39 39 L49 49" stroke="#FAF8F3" strokeWidth="5" strokeLinecap="round" />
      <path d="M29 21c-5 3-7 8-5 13 5 0 9-4 9-9 0-2-1-3-4-4z" fill="#B8D3BE" />
    </svg>
  );
}

const NAV = [
  { to: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { to: '/explore', label: 'Explore', icon: Compass, match: (p: string) => /^\/(explore|search|category|ingredient|ingredients|product|topic|analyse|guide)/.test(p) },
  { to: '/compare', label: 'Compare', icon: Columns2, match: (p: string) => p.startsWith('/compare') },
  { to: '/learn', label: 'Learn', icon: BookOpen, match: (p: string) => p.startsWith('/learn') },
  { to: '/profile', label: 'Profile', icon: User, match: (p: string) => /^\/(profile|about|content)/.test(p) },
];

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function useSwUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const onUpdate = (e: Event) => setWaiting((e as CustomEvent<ServiceWorker>).detail);
    window.addEventListener('fivew-oneh:sw-update', onUpdate);
    return () => window.removeEventListener('fivew-oneh:sw-update', onUpdate);
  }, []);
  return waiting;
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const online = useOnline();
  const waiting = useSwUpdate();
  const showTopSearch = pathname !== '/' && pathname !== '/search';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-ivory text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-white/70 px-4 py-6 backdrop-blur lg:flex">
        <Link to="/" className="mb-8 flex items-center gap-2.5 px-2">
          <Logo />
          <div>
            <div className="text-[17px] font-semibold tracking-tight text-forest-800">CareLens</div>
            <div className="text-[11px] text-ink-muted">Better choices. Healthier you.</div>
          </div>
        </Link>
        <nav aria-label="Primary" className="space-y-1">
          {NAV.map(({ to, label, icon: Icon, match }) => (
            <NavLink key={to} to={to} className={cx('flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[14px] font-medium', match(pathname) ? 'bg-forest-50 text-forest-800' : 'text-ink-soft hover:bg-ivory-100')}>
              <Icon size={19} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 border-t border-line pt-4">
          <NavLink to="/analyse" className={cx('flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[14px] font-medium', pathname === '/analyse' ? 'bg-forest-50 text-forest-800' : 'text-ink-soft hover:bg-ivory-100')}>
            <ScanText size={19} /> Ingredient analyser
          </NavLink>
        </div>
        <p className="mt-auto px-2 text-[11px] leading-relaxed text-ink-faint">Educational information only — not medical advice. Product records shown are fictional demos.</p>
      </aside>

      <div className="lg:pl-60">
        {showTopSearch && (
          <div className="sticky top-0 z-20 hidden border-b border-line bg-ivory/90 px-8 py-3 backdrop-blur lg:block">
            <div className="mx-auto max-w-3xl">
              <SearchBar compact />
            </div>
          </div>
        )}
        {!online && (
          <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-ink px-4 py-2 text-[12.5px] text-white" role="status">
            <WifiOff size={14} /> You're offline. Saved content and the built-in database still work.
          </div>
        )}
        {waiting && (
          <div className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-[13.5px] text-white shadow-lg lg:bottom-6" role="status">
            <RefreshCw size={16} />
            <span className="flex-1">A new version of CareLens is available.</span>
            <button type="button" className="rounded-lg bg-white px-3 py-1.5 font-medium text-ink" onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}>
              Refresh
            </button>
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-28 pt-3 sm:px-6 lg:px-8 lg:pb-12 lg:pt-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <NavLink key={to} to={to} className={cx('flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-forest-700' : 'text-ink-muted')} aria-current={active ? 'page' : undefined}>
                <Icon size={21} strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
