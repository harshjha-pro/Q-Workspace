import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Bot, Briefcase, Building2, BusFront, CalendarDays, ChartNoAxesColumn, Compass, Factory, FlaskConical, Gift, GraduationCap, HandCoins, HeartHandshake,
  HeartPulse, Home, House, Landmark, LayoutDashboard, MapPin, Megaphone, MessagesSquare, Newspaper, PhoneCall, Scale, Search, Settings, ShieldCheck,
  ShoppingBag, Siren, Store, User, Vote, Wheat, Wifi, WifiOff, Wrench
} from 'lucide-react';
import { LOCALITIES, localityName, ROLES } from '@/config/catalog';
import { useCurrentUser, useDB, useLang, useOnline, useSession, useT } from '@/hooks/useStore';
import { sessionStore } from '@/services/session';
import { store } from '@/services/store';
import { usePWA } from '@/app/pwa';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { Avatar, Button, cx, SkeletonList } from '@/components/ui/primitives';
import { Dialog, useUI } from '@/components/ui/overlay';
import type { Role } from '@/types/models';

export function AppShell() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); document.getElementById('main')?.focus({ preventScroll: true }); }, [loc.pathname]);
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <DemoBar />
      <Header />
      <ConnectivityBanner />
      <div className="mx-auto flex max-w-7xl gap-6 px-4 lg:px-6">
        <Sidebar />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-28 pt-4 outline-none lg:pb-12">
          <ErrorBoundary resetKey={loc.pathname}>
            <Suspense fallback={<SkeletonList rows={5} />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav />
      <UpdatePrompt />
    </div>
  );
}

function DemoBar() {
  const t = useT();
  const { demoBannerDismissed } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      {!demoBannerDismissed && (
        <div className="bg-amber-50 border-b border-amber/30 text-[13px] text-amber-700">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 lg:px-6">
            <FlaskConical className="size-4 shrink-0" aria-hidden />
            <p className="flex-1 text-ink/80">{t('demoNotice')}</p>
            <button type="button" className="font-semibold underline" onClick={() => setOpen(true)}>{t('switchRole')}</button>
            <button type="button" className="px-1 font-semibold" aria-label="Hide demo notice" onClick={() => sessionStore.set({ demoBannerDismissed: true })}>✕</button>
          </div>
        </div>
      )}
      {demoBannerDismissed && (
        <button type="button" onClick={() => setOpen(true)} className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-3 z-40 inline-flex items-center gap-1.5 rounded-full bg-amber px-3 py-2 text-xs font-bold text-navy-deep shadow-lg lg:bottom-4" aria-label="Demo controls">
          <FlaskConical className="size-4" aria-hidden />Demo
        </button>
      )}
      <RoleDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** DEMO-ONLY role switcher. Not authentication — production roles come from the backend. */
export function RoleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role, userId } = useSession();
  const { toast, confirm } = useUI();
  const nav = useNavigate();
  const t = useT();
  const set = (r: Role) => {
    sessionStore.set({ role: r, userId: userId ?? 'u-demo' });
    toast(`Now exploring as: ${ROLES.find((x) => x.id === r)?.label} (demo)`);
    onClose();
    if (r === 'admin') nav('/admin');
    else if (r === 'business') nav('/business-dashboard');
    else if (r === 'employer') nav('/employers');
    else if (r === 'provider') nav('/provider-dashboard');
    else if (r === 'owner') nav('/owner-dashboard');
    else if (r === 'jobseeker') nav('/applications');
  };
  return (
    <Dialog open={open} onClose={onClose} title={t('switchRole')} description="Development/demo feature only. It is not secure authentication; in production, roles are assigned and enforced by the server.">
      <div className="grid gap-2">
        {ROLES.map((r) => (
          <button key={r.id} type="button" onClick={() => set(r.id)} className={cx('card flex items-center justify-between p-3 text-left hover:border-navy/40', role === r.id && 'border-navy ring-2 ring-navy/15')} aria-pressed={role === r.id}>
            <span><span className="block font-semibold text-ink">{r.label}</span><span className="text-sm text-muted">{r.desc}</span></span>
            {role === r.id && <span className="text-xs font-bold text-teal">Active</span>}
          </button>
        ))}
        <div className="mt-2 border-t border-line pt-3">
          <Button variant="secondary" block onClick={async () => {
            if (await confirm({ title: t('resetDemo'), message: 'This restores all sample data and removes everything you created in this browser.', confirmLabel: 'Reset', danger: true })) {
              store.reset(); sessionStore.reset(); toast('Demo data reset'); onClose(); nav('/');
            }
          }}>{t('resetDemo')}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function Header() {
  const t = useT();
  const nav = useNavigate();
  const user = useCurrentUser();
  const { prefs, userId } = useSession();
  const lang = useLang();
  const unread = useDB((s) => s.notifications.filter((n) => (n.userId === userId || n.userId === 'all') && !n.read && prefs.notifyCategories.includes(n.type)).length);
  const [q, setQ] = useState('');
  const [locOpen, setLocOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 lg:px-6">
        <Link to="/" className="flex items-center gap-2 text-navy" aria-label="One Bhilwara home">
          <img src="/icons/icon-192.png" alt="" width={36} height={36} className="rounded-xl" />
          <span className="hidden text-lg font-extrabold tracking-tight sm:block">One <span className="text-teal">Bhilwara</span></span>
        </Link>
        <button type="button" onClick={() => setLocOpen(true)} className="ml-1 inline-flex min-h-10 max-w-[44vw] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink hover:bg-page" aria-label={`${t('locality')}: ${localityName(prefs.localityId, lang)}. Change`}>
          <MapPin className="size-4 shrink-0 text-teal" aria-hidden /><span className="truncate">{localityName(prefs.localityId, lang)}</span>
        </button>
        <form className="ml-auto hidden flex-1 md:block md:max-w-md" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/search?q=${encodeURIComponent(q)}`); }}>
          <label htmlFor="global-search" className="sr-only">{t('search')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="global-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} className="input min-h-10 pl-9" />
          </div>
        </form>
        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <Link to="/search" className="grid size-10 place-items-center rounded-lg hover:bg-page md:hidden" aria-label={t('search')}><Search className="size-5" aria-hidden /></Link>
          <Link to="/notifications" className="relative grid size-10 place-items-center rounded-lg hover:bg-page" aria-label={`${t('notifications')}${unread ? `, ${unread} unread` : ''}`}>
            <Bell className="size-5" aria-hidden />
            {unread > 0 && <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
          </Link>
          <label htmlFor="lang" className="sr-only">{t('language')}</label>
          <select id="lang" value={lang} onChange={(e) => sessionStore.setPrefs({ lang: e.target.value as 'en' | 'hi' })} className="min-h-10 rounded-lg border border-line bg-white px-1.5 text-sm font-semibold">
            <option value="en">EN</option><option value="hi">हिं</option>
          </select>
          {userId && user ? (
            <Link to="/profile" className="ml-1 rounded-full" aria-label={`${t('navProfile')}: ${user.name}`}><Avatar name={user.name} size={36} /></Link>
          ) : (
            <Link to="/signin" className="ml-1 inline-flex min-h-10 items-center rounded-lg bg-navy px-3 text-sm font-semibold text-white">{t('signIn')}</Link>
          )}
        </div>
      </div>
      <LocalityDialog open={locOpen} onClose={() => setLocOpen(false)} />
    </header>
  );
}

export function LocalityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const { prefs } = useSession();
  const { toast } = useUI();
  return (
    <Dialog open={open} onClose={onClose} title={t('chooseLocality')} description="Used to personalise news, services, listings and offers. We don’t use your device location unless you ask.">
      <ul className="grid grid-cols-2 gap-2">
        {LOCALITIES.map((l) => (
          <li key={l.id}>
            <button type="button" aria-pressed={prefs.localityId === l.id} onClick={() => {
              sessionStore.setPrefs({ localityId: l.id, localities: Array.from(new Set([l.id, ...prefs.localities])).slice(0, 5) });
              toast(`Locality set to ${l.name}`); onClose();
            }} className={cx('w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium', prefs.localityId === l.id ? 'border-navy bg-navy text-white' : 'border-line bg-white hover:border-navy/40')}>
              {lang === 'hi' ? l.nameHi : l.name}<span className={cx('block text-xs', prefs.localityId === l.id ? 'text-white/70' : 'text-muted')}>{l.zone}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

type NavItem = { to: string; label: string; icon: ReactNode; roles?: Role[] };

function useNavGroups(): { title: string; items: NavItem[] }[] {
  const t = useT();
  const i = (C: typeof Home) => <C className="size-[18px]" aria-hidden />;
  return [
    { title: 'City', items: [
      { to: '/', label: t('navHome'), icon: i(Home) }, { to: '/news', label: t('navNews'), icon: i(Newspaper) }, { to: '/alerts', label: t('alerts'), icon: i(Siren) },
      { to: '/community', label: t('community'), icon: i(MessagesSquare) }, { to: '/polls', label: t('polls'), icon: i(Vote) }, { to: '/discover', label: t('navDiscover'), icon: i(Compass) }, { to: '/ai', label: t('navAI'), icon: i(Bot) }
    ] },
    { title: 'Everyday', items: [
      { to: '/services', label: t('services'), icon: i(Wrench) }, { to: '/jobs', label: t('jobs'), icon: i(Briefcase) }, { to: '/property', label: t('property'), icon: i(House) },
      { to: '/marketplace', label: t('marketplace'), icon: i(ShoppingBag) }, { to: '/businesses', label: t('businesses'), icon: i(Store) }, { to: '/offers', label: t('offers'), icon: i(Gift) }
    ] },
    { title: 'Life & citizen', items: [
      { to: '/government', label: t('government'), icon: i(Landmark) }, { to: '/education', label: t('education'), icon: i(GraduationCap) }, { to: '/healthcare', label: t('healthcare'), icon: i(HeartPulse) },
      { to: '/agriculture', label: t('agriculture'), icon: i(Wheat) }, { to: '/weddings', label: t('weddings'), icon: i(HeartHandshake) }, { to: '/events', label: t('events'), icon: i(CalendarDays) },
      { to: '/transport', label: t('transport'), icon: i(BusFront) }, { to: '/finance', label: t('finance'), icon: i(HandCoins) }, { to: '/professionals', label: t('professionals'), icon: i(Scale) }
    ] },
    { title: 'For business', items: [
      { to: '/business-dashboard', label: 'Business dashboard', icon: i(LayoutDashboard), roles: ['business', 'admin'] }, { to: '/employers', label: 'Employer dashboard', icon: i(Building2), roles: ['employer', 'admin'] },
      { to: '/provider-dashboard', label: 'Provider dashboard', icon: i(Wrench), roles: ['provider', 'admin'] }, { to: '/owner-dashboard', label: 'Property dashboard', icon: i(House), roles: ['owner', 'admin'] },
      { to: '/advertise', label: 'Advertise', icon: i(Megaphone) }, { to: '/pricing', label: 'Plans & pricing', icon: i(HandCoins) }, { to: '/b2b', label: 'Textile B2B', icon: i(Factory) }, { to: '/insights', label: 'City insights', icon: i(ChartNoAxesColumn) }
    ] },
    { title: 'You', items: [
      { to: '/rewards', label: t('rewards'), icon: i(Gift) }, { to: '/settings', label: t('settings'), icon: i(Settings) }, { to: '/help', label: t('help'), icon: i(PhoneCall) },
      { to: '/admin', label: t('admin'), icon: i(ShieldCheck), roles: ['admin'] }
    ] }
  ];
}

function Sidebar() {
  const groups = useNavGroups();
  const { role } = useSession();
  return (
    <nav aria-label="All sections" className="sticky top-20 hidden h-[calc(100dvh-6rem)] w-56 shrink-0 overflow-y-auto pb-6 pt-4 lg:block">
      {groups.map((g) => (
        <div key={g.title} className="mb-4">
          <p className="mb-1 px-3 text-xs font-bold uppercase tracking-wide text-muted">{g.title}</p>
          <ul>
            {g.items.filter((it) => !it.roles || it.roles.includes(role)).map((it) => (
              <li key={it.to}>
                <NavLink to={it.to} end={it.to === '/'} className={({ isActive }) => cx('flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium', isActive ? 'bg-navy text-white' : 'text-ink hover:bg-white')}>
                  {it.icon}{it.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function BottomNav() {
  const t = useT();
  const items = [
    { to: '/', label: t('navHome'), I: Home }, { to: '/news', label: t('navNews'), I: Newspaper }, { to: '/discover', label: t('navDiscover'), I: Compass },
    { to: '/ai', label: t('navAI'), I: Bot }, { to: '/profile', label: t('navProfile'), I: User }
  ];
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, I }) => (
          <li key={to}>
            <NavLink to={to} end={to === '/'} className={({ isActive }) => cx('flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-navy' : 'text-muted')}>
              {({ isActive }) => (<><span className={cx('grid h-7 w-12 place-items-center rounded-full', isActive && 'bg-navy-50')}><I className="size-5" aria-hidden /></span>{label}</>)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ConnectivityBanner() {
  const online = useOnline();
  const t = useT();
  const [showBack, setShowBack] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  useEffect(() => {
    if (!online) setWasOffline(true);
    else if (wasOffline) { setShowBack(true); const tm = setTimeout(() => setShowBack(false), 3000); return () => clearTimeout(tm); }
  }, [online, wasOffline]);
  if (online && !showBack) return null;
  return (
    <div role="status" className={cx('flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium', online ? 'bg-teal-50 text-teal' : 'bg-navy-deep text-white')}>
      {online ? <Wifi className="size-4" aria-hidden /> : <WifiOff className="size-4" aria-hidden />}{online ? t('backOnline') : t('offline')}
    </div>
  );
}

function UpdatePrompt() {
  const { updateReady, applyUpdate } = usePWA();
  const t = useT();
  if (!updateReady) return null;
  return (
    <div className="fixed inset-x-0 top-20 z-50 mx-auto flex w-fit items-center gap-3 rounded-xl bg-navy-deep px-4 py-3 text-sm text-white shadow-lg" role="status">
      {t('updateReady')} <button type="button" className="font-bold text-amber" onClick={applyUpdate}>{t('reload')}</button>
    </div>
  );
}

export { useNavGroups };
