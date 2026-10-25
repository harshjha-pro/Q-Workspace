import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Bell, Bot, Briefcase, Building2, BusFront, CalendarDays, ChartNoAxesColumn, Compass, Factory, FlaskConical, Gift, GraduationCap, HandCoins, HeartHandshake,
  HeartPulse, Home, House, Landmark, LayoutDashboard, MapPin, Megaphone, MessagesSquare, Newspaper, PhoneCall, Scale, Search, Settings, ShieldCheck,
  Menu, Plus, ShoppingBag, Siren, Store, User, Vote, Wheat, Wifi, WifiOff, Wrench, X
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
            <p className="flex-1 truncate text-ink/80"><span className="sm:hidden">Demo mode · sample data only</span><span className="hidden sm:inline">{t('demoNotice')}</span></p>
            <button type="button" className="shrink-0 font-semibold underline" onClick={() => setOpen(true)}><span className="sm:hidden">Roles</span><span className="hidden sm:inline">{t('switchRole')}</span></button>
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
          <button key={r.id} type="button" onClick={() => set(r.id)} className={cx('card flex items-center justify-between p-3 text-left hover:border-brand/40', role === r.id && 'border-brand ring-2 ring-brand/15')} aria-pressed={role === r.id}>
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
  const loc = useLocation();
  const user = useCurrentUser();
  const { prefs, userId } = useSession();
  const lang = useLang();
  const unread = useUnread();
  const [q, setQ] = useState('');
  const [locOpen, setLocOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [post, setPost] = useState(false);
  const isHome = loc.pathname === '/';
  return (
    <header className={cx('sticky top-0 z-30 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur', !isHome && 'hidden lg:block')}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 lg:px-6">
        <button type="button" onClick={() => setMenu(true)} className="-ml-2 grid size-10 place-items-center rounded-lg text-ink hover:bg-page lg:hidden" aria-label="Open menu"><Menu className="size-6" aria-hidden /></button>
        <Link to="/" className="flex items-center gap-2.5" aria-label="One Bhilwara home">
          <img src="/icons/icon-192.png" alt="" width={36} height={36} className="hidden rounded-xl lg:block" />
          <span className="leading-tight">
            <span className="block text-[22px] font-extrabold tracking-tight text-navy">One <span className="text-brand">Bhilwara</span></span>
            <span className="block text-[11px] font-medium text-muted">Local. For You. Always.</span>
          </span>
        </Link>
        <button type="button" onClick={() => setLocOpen(true)} className="ml-3 hidden min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink hover:bg-page lg:inline-flex" aria-label={`${t('locality')}: ${localityName(prefs.localityId, lang)}. Change`}>
          <MapPin className="size-4 text-brand" aria-hidden />{localityName(prefs.localityId, lang)}
        </button>
        <form className="ml-auto hidden flex-1 md:block md:max-w-md" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/search?q=${encodeURIComponent(q)}`); }}>
          <label htmlFor="global-search" className="sr-only">{t('search')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="global-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} className="input min-h-10 rounded-full pl-9" />
          </div>
        </form>
        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <button type="button" onClick={() => setPost(true)} className="grid size-10 place-items-center rounded-full bg-brand text-white shadow hover:bg-brand-600" aria-label="Create a post or listing" aria-haspopup="dialog"><Plus className="size-5" aria-hidden /></button>
          <Link to="/notifications" className="relative grid size-10 place-items-center rounded-full hover:bg-page" aria-label={`${t('notifications')}${unread ? `, ${unread} unread` : ''}`}>
            <Bell className="size-6 text-ink" aria-hidden />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger ring-2 ring-white" />}
          </Link>
          <label htmlFor="lang" className="sr-only">{t('language')}</label>
          <select id="lang" value={lang} onChange={(e) => sessionStore.setPrefs({ lang: e.target.value as 'en' | 'hi' })} className="hidden min-h-10 rounded-lg border border-line bg-white px-1.5 text-sm font-semibold lg:block">
            <option value="en">EN</option><option value="hi">हिं</option>
          </select>
          {userId && user ? (
            <Link to="/profile" className="ml-1 hidden rounded-full lg:block" aria-label={`${t('navProfile')}: ${user.name}`}><Avatar name={user.name} size={36} /></Link>
          ) : (
            <Link to="/signin" className="ml-1 hidden min-h-10 items-center rounded-lg bg-brand px-3 text-sm font-semibold text-white lg:inline-flex">{t('signIn')}</Link>
          )}
        </div>
      </div>
      <LocalityDialog open={locOpen} onClose={() => setLocOpen(false)} />
      <PostSheet open={post} onClose={() => setPost(false)} />
      <MobileMenu open={menu} onClose={() => setMenu(false)} onLocality={() => { setMenu(false); setLocOpen(true); }} />
    </header>
  );
}

function useUnread() {
  const { prefs, userId } = useSession();
  return useDB((s) => s.notifications.filter((n) => (n.userId === userId || n.userId === 'all') && !n.read && prefs.notifyCategories.includes(n.type)).length);
}

/** Slide-in drawer giving mobile users access to every module. */
function MobileMenu({ open, onClose, onLocality }: { open: boolean; onClose: () => void; onLocality: () => void }) {
  const groups = useNavGroups();
  const { role, prefs, userId } = useSession();
  const user = useCurrentUser();
  const lang = useLang();
  const t = useT();
  const [roles, setRoles] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const loc = useLocation();
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  useEffect(() => { onClose(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <dialog ref={ref} aria-label="Menu" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}
        className="m-0 h-dvh max-h-dvh w-[86vw] max-w-sm bg-white p-0 backdrop:bg-navy/50">
        {open && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-line p-4">
              <div className="flex items-center gap-3">
                {user ? <Avatar name={user.name} size={40} /> : <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-xl" />}
                <div><p className="font-bold text-ink">{user?.name ?? 'One Bhilwara'}</p>{userId ? <Link to="/profile" className="text-sm text-brand">View profile</Link> : <Link to="/signin" className="text-sm text-brand">{t('signIn')}</Link>}</div>
              </div>
              <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full hover:bg-page" aria-label="Close menu"><X className="size-5" aria-hidden /></button>
            </div>
            <div className="flex gap-2 border-b border-line p-3">
              <button type="button" onClick={onLocality} className="chip flex-1 justify-center"><MapPin className="size-4 text-brand" aria-hidden />{localityName(prefs.localityId, lang)}</button>
              <select aria-label={t('language')} value={lang} onChange={(e) => sessionStore.setPrefs({ lang: e.target.value as 'en' | 'hi' })} className="chip">
                <option value="en">English</option><option value="hi">हिंदी</option>
              </select>
            </div>
            <nav aria-label="All sections" className="flex-1 overflow-y-auto p-3">
              {groups.map((g) => (
                <div key={g.title} className="mb-3">
                  <p className="mb-1 px-3 text-xs font-bold uppercase tracking-wide text-muted">{g.title}</p>
                  <ul>{g.items.filter((it) => !it.roles || it.roles.includes(role)).map((it) => (
                    <li key={it.to}><NavLink to={it.to} end={it.to === '/'} className={({ isActive }) => cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium', isActive ? 'bg-brand-50 text-brand' : 'text-ink hover:bg-page')}>{it.icon}{it.label}</NavLink></li>
                  ))}</ul>
                </div>
              ))}
            </nav>
            <div className="border-t border-line p-3"><Button variant="secondary" block icon={<FlaskConical className="size-4" aria-hidden />} onClick={() => setRoles(true)}>{t('switchRole')}</Button></div>
          </div>
        )}
      </dialog>
      <RoleDialog open={roles} onClose={() => setRoles(false)} />
    </>
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
            }} className={cx('w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium', prefs.localityId === l.id ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:border-brand/40')}>
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
    { title: 'Main', items: [
      { to: '/', label: t('navHome'), icon: i(Home) }, { to: '/services', label: t('navServices'), icon: i(Wrench) }, { to: '/activity', label: t('navActivity'), icon: i(Activity) },
      { to: '/news', label: t('navNews'), icon: i(Newspaper) }, { to: '/profile', label: t('navProfile'), icon: i(User) }
    ] },
    { title: 'City', items: [
      { to: '/alerts', label: t('alerts'), icon: i(Siren) },
      { to: '/community', label: t('community'), icon: i(MessagesSquare) }, { to: '/polls', label: t('polls'), icon: i(Vote) }, { to: '/discover', label: t('navDiscover'), icon: i(Compass) }, { to: '/ai', label: t('navAI'), icon: i(Bot) }
    ] },
    { title: 'Everyday', items: [
      { to: '/jobs', label: t('jobs'), icon: i(Briefcase) }, { to: '/property', label: t('property'), icon: i(House) },
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
                <NavLink to={it.to} end={it.to === '/'} className={({ isActive }) => cx('flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium', isActive ? 'bg-brand-50 text-brand font-semibold' : 'text-ink hover:bg-white')}>
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

/** The five primary sections. Everything else lives in the menu drawer / sidebar. */
function usePrimaryNav() {
  const t = useT();
  return [
    { to: '/', label: t('navHome'), I: Home },
    { to: '/services', label: t('navServices'), I: Wrench },
    { to: '/activity', label: t('navActivity'), I: Activity },
    { to: '/news', label: t('navNewsShort'), I: Newspaper },
    { to: '/profile', label: t('navProfile'), I: User }
  ];
}

function BottomNav() {
  const items = usePrimaryNav();
  const unread = useUnread();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(16_24_40/0.06)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, I }) => (
          <li key={to}>
            <NavLink to={to} end={to === '/'} className={({ isActive }) => cx('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-brand' : 'text-muted')}>
              {({ isActive }) => (<>
                <span className={cx('grid h-8 w-14 place-items-center rounded-full transition-colors', isActive && 'bg-brand-50')}><I className="size-[22px]" aria-hidden /></span>
                <span className="max-w-full truncate px-0.5">{label}</span>
                {to === '/activity' && unread > 0 && <span className="absolute right-[calc(50%-20px)] top-2 size-2.5 rounded-full bg-danger ring-2 ring-white" aria-label={`${unread} unread`} />}
              </>)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const POST_OPTIONS = [
  { to: '/community?compose=1', label: 'Community post', desc: 'Ask, discuss, recommend', I: MessagesSquare, tint: 'bg-violet-50 text-violet-600' },
  { to: '/service-requests/new', label: 'Request a service', desc: 'Get quotes from local providers', I: Wrench, tint: 'bg-brand-50 text-brand' },
  { to: '/marketplace/new', label: 'Sell an item', desc: 'List in Buy & Sell', I: ShoppingBag, tint: 'bg-rose-50 text-rose-600' },
  { to: '/property/new', label: 'List a property', desc: 'Rent, sale or PG', I: House, tint: 'bg-purple-50 text-purple-600' },
  { to: '/employers?tab=post', label: 'Post a job', desc: 'Hire locally', I: Briefcase, tint: 'bg-emerald-50 text-emerald-600' },
  { to: '/businesses/new', label: 'Add your business', desc: 'Free basic listing', I: Store, tint: 'bg-amber-50 text-amber-700' },
  { to: '/polls/new', label: 'Suggest a poll', desc: 'Ask the city', I: Vote, tint: 'bg-sky-50 text-sky-600' }
];

export function PostSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  return (
    <Dialog open={open} onClose={onClose} title="Create" description="What would you like to post?">
      <ul className="grid gap-2">
        {POST_OPTIONS.map(({ to, label, desc, I, tint }) => (
          <li key={to}>
            <button type="button" onClick={() => { onClose(); nav(to); }} className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:border-brand/40">
              <span className={cx('grid size-11 place-items-center rounded-xl', tint)}><I className="size-5" aria-hidden /></span>
              <span><span className="block font-semibold text-ink">{label}</span><span className="text-sm text-muted">{desc}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
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
    <div role="status" className={cx('flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium', online ? 'bg-teal-50 text-teal' : 'bg-navy text-white')}>
      {online ? <Wifi className="size-4" aria-hidden /> : <WifiOff className="size-4" aria-hidden />}{online ? t('backOnline') : t('offline')}
    </div>
  );
}

function UpdatePrompt() {
  const { updateReady, applyUpdate } = usePWA();
  const t = useT();
  if (!updateReady) return null;
  return (
    <div className="fixed inset-x-0 top-20 z-50 mx-auto flex w-fit items-center gap-3 rounded-xl bg-navy px-4 py-3 text-sm text-white shadow-lg" role="status">
      {t('updateReady')} <button type="button" className="font-bold text-amber" onClick={applyUpdate}>{t('reload')}</button>
    </div>
  );
}

export { useNavGroups };
