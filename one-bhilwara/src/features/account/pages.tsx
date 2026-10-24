import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bell, Bookmark, Briefcase, CalendarDays, Check, CircleCheck, CircleX, Download, FileText, HelpCircle, LogOut, MessageSquare, Phone, Receipt, Settings, Smartphone, Trash2, Wrench } from 'lucide-react';
import type { Payment, Preferences } from '@/types/models';
import { EMERGENCY_NUMBERS, HOME_SECTIONS, INTERESTS, JOB_CATEGORIES, LOCALITIES, localityName, NEWS_CATEGORIES, ROLES } from '@/config/catalog';
import { DEMO_USER_ID } from '@/data/seed';
import { useCurrentUser, useDB, useDocumentTitle, useSession } from '@/hooks/useStore';
import { demoCheckout } from '@/services/adapters/payments';
import { pushState, requestPush } from '@/services/adapters/push';
import { actorIds, fileReport, pointsTotal, sanitize } from '@/services/domain/common';
import { integrations } from '@/services/integrations';
import { defaultPrefs, sessionStore } from '@/services/session';
import { repo, store } from '@/services/store';
import { usePWA } from '@/app/pwa';
import { useRequireAuth } from '@/components/shared';
import { Avatar, Badge, Button, DemoBadge, EmptyState, LinkButton, Notice, PageHeader, StatusPill } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { Checkbox, Select, TextArea, TextField, Toggle } from '@/components/ui/form';
import { formatDate, formatDateTime, formatINR, formatMobile, isValidMobile, timeAgo } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';
import NotFound from '@/app/NotFound';

/* ------------------------------- Profile ------------------------------- */

const SAVED_LINK: Record<string, (id: string) => string> = {
  article: (id) => `/news/${id}`, job: (id) => `/jobs/${id}`, property: (id) => `/property/${id}`, classified: (id) => `/marketplace/${id}`, business: (id) => `/businesses/${id}`,
  provider: (id) => `/service-providers/${id}`, event: (id) => `/events/${id}`, institution: (id) => `/education/${id}`, healthcare: (id) => `/healthcare/${id}`, scheme: (id) => `/government/schemes/${id}`,
  vendor: (id) => `/weddings/${id}`, professional: (id) => `/professionals/${id}`
};
const SAVED_LABEL: Record<string, string> = { article: 'News', job: 'Jobs', property: 'Property', classified: 'Marketplace', business: 'Businesses', provider: 'Services', event: 'Events', institution: 'Education', healthcare: 'Healthcare', scheme: 'Schemes', vendor: 'Wedding vendors', professional: 'Professionals' };

type ProfileTab = 'saved' | 'activity' | 'requests' | 'applications' | 'bookings' | 'enquiries' | 'listings' | 'rewards';

export function ProfilePage() {
  useDocumentTitle('Profile');
  const user = useCurrentUser();
  const { userId, role } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as ProfileTab) ?? 'saved';
  const db = useDB((s) => s);
  const { toast, confirm } = useUI();
  if (!user) return <NotFound />;
  const roleLabel = ROLES.find((r) => r.id === role)?.label;
  const saved = db.saved.filter((s) => s.userId === userId);
  const titleOf = (type: string, id: string): string => {
    const map: Record<string, { id: string; title?: string; name?: string }[]> = { article: db.articles, job: db.jobs, property: db.properties, classified: db.classifieds, business: db.businesses, provider: db.providers, event: db.events, institution: db.institutions, healthcare: db.healthcare, scheme: db.schemes, vendor: db.businesses, professional: db.professionals };
    const r = map[type]?.find((x) => x.id === id);
    return r?.title ?? r?.name ?? id;
  };
  const myPosts = db.posts.filter((p) => p.userId === userId);
  const myComments = db.comments.filter((c) => c.userId === userId);
  const myVotes = db.votes.filter((v) => v.userId === userId);
  const requests = db.serviceRequests.filter((r) => r.userId === userId);
  const apps = db.applications.filter((a) => a.userId === userId);
  const bookings = db.bookings.filter((b) => b.userId === userId);
  const enquiries = db.enquiries.filter((q) => q.fromUserId === userId);
  const ids = actorIds(userId, role);
  const listings = [
    ...db.classifieds.filter((c) => c.sellerId === userId && c.status !== 'removed').map((c) => ({ id: c.id, title: c.title, status: c.status, link: `/marketplace/${c.id}`, kind: 'Marketplace' })),
    ...db.properties.filter((p) => p.ownerId && ids.includes(p.ownerId) && p.status !== 'removed').map((p) => ({ id: p.id, title: p.title, status: p.status, link: `/property/${p.id}`, kind: 'Property' })),
    ...db.businesses.filter((b) => b.ownerId && ids.includes(b.ownerId)).map((b) => ({ id: b.id, title: b.name, status: b.verification, link: `/businesses/${b.id}`, kind: 'Business' }))
  ];
  const tabs: { id: ProfileTab; label: string; count?: number; roles?: string[] }[] = [
    { id: 'saved', label: 'Saved', count: saved.length }, { id: 'activity', label: 'Posts & polls', count: myPosts.length + myComments.length }, { id: 'requests', label: 'Service requests', count: requests.length },
    { id: 'applications', label: 'Applications', count: apps.length, roles: ['resident', 'jobseeker', 'admin'] }, { id: 'bookings', label: 'Bookings', count: bookings.length }, { id: 'enquiries', label: 'Enquiries', count: enquiries.length },
    { id: 'listings', label: 'My listings', count: listings.length }, { id: 'rewards', label: 'Rewards' }
  ];
  const groups = Object.entries(saved.reduce<Record<string, typeof saved>>((acc, s) => { (acc[s.type] ??= []).push(s); return acc; }, {}));
  return (
    <div className="grid gap-5">
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <Avatar name={user.name} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold text-navy">{user.name}</h1>
          <p className="text-sm text-muted">{localityName(user.localityId)} · {roleLabel} (demo role){user.mobile ? ` · ${formatMobile(user.mobile)}` : ''}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">{user.demo && <DemoBadge label="Demo account" />}<Badge tone="amber">{pointsTotal(userId)} points</Badge>{user.interests.slice(0, 4).map((i) => <Badge key={i}>{i}</Badge>)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="secondary" to="/settings" icon={<Settings className="size-4" aria-hidden />}>Settings</LinkButton>
          <LinkButton variant="secondary" to="/notifications" icon={<Bell className="size-4" aria-hidden />}>Notifications</LinkButton>
          <LinkButton variant="ghost" to="/help" icon={<HelpCircle className="size-4" aria-hidden />}>Help</LinkButton>
        </div>
      </section>
      {(role === 'business' || role === 'employer' || role === 'provider' || role === 'owner' || role === 'admin') && (
        <div className="flex flex-wrap gap-2">
          {role === 'business' && <LinkButton to="/business-dashboard">Business dashboard</LinkButton>}
          {role === 'employer' && <LinkButton to="/employers">Employer dashboard</LinkButton>}
          {role === 'provider' && <LinkButton to="/provider-dashboard">Provider dashboard</LinkButton>}
          {role === 'owner' && <LinkButton to="/owner-dashboard">Property dashboard</LinkButton>}
          {role === 'admin' && <LinkButton to="/admin">Admin panel</LinkButton>}
        </div>
      )}
      <Tabs label="Profile sections" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={tabs.filter((t) => !t.roles || t.roles.includes(role))} />
      {tab === 'saved' && (saved.length === 0 ? <EmptyState icon={<Bookmark className="size-6" aria-hidden />} title="Nothing saved yet" text="Tap Save on news, jobs, property, services and more." action={<LinkButton variant="secondary" to="/discover">Discover</LinkButton>} /> : (
        <div className="grid gap-4 md:grid-cols-2">{groups.map(([type, items]) => (
          <section key={type} className="card p-4"><h2 className="mb-2 font-bold text-navy">{SAVED_LABEL[type] ?? type}</h2>
            <ul className="divide-y divide-line">{items.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 py-2"><Link to={SAVED_LINK[type]?.(s.id) ?? '/'} className="min-w-0 truncate text-sm font-medium hover:text-navy">{titleOf(type, s.id)}</Link><span className="shrink-0 text-xs text-muted">{timeAgo(s.at)}</span></li>)}</ul>
          </section>
        ))}</div>
      ))}
      {tab === 'activity' && (
        <div className="grid gap-4 md:grid-cols-3">
          <section className="card p-4"><h2 className="mb-2 font-bold text-navy">My posts</h2>{myPosts.length ? myPosts.map((p) => <Link key={p.id} to={`/community/${p.id}`} className="block py-1.5 text-sm hover:text-navy">{p.text.slice(0, 70)} <StatusPill status={p.status} /></Link>) : <p className="text-sm text-muted">No posts yet.</p>}</section>
          <section className="card p-4"><h2 className="mb-2 font-bold text-navy">My comments</h2>{myComments.length ? myComments.slice(0, 10).map((c) => <p key={c.id} className="py-1.5 text-sm">“{c.text.slice(0, 60)}” <span className="text-xs text-muted">· {timeAgo(c.createdAt)}</span></p>) : <p className="text-sm text-muted">No comments yet.</p>}</section>
          <section className="card p-4"><h2 className="mb-2 font-bold text-navy">My poll activity</h2>{myVotes.length ? myVotes.map((v) => { const p = db.polls.find((x) => x.id === v.pollId); return <Link key={v.id} to={`/polls/${v.pollId}`} className="block py-1.5 text-sm hover:text-navy">{p?.question}</Link>; }) : <p className="text-sm text-muted">You haven’t voted yet.</p>}</section>
        </div>
      )}
      {tab === 'requests' && (requests.length === 0 ? <EmptyState icon={<Wrench className="size-6" aria-hidden />} title="No service requests" action={<LinkButton to="/service-requests/new">Request a service</LinkButton>} /> : (
        <ul className="grid gap-2">{requests.map((r) => <li key={r.id}><Link to={`/service-requests/${r.id}`} className="card flex items-center justify-between gap-2 p-3"><span className="truncate text-sm">{r.description}</span><StatusPill status={r.status} /></Link></li>)}</ul>
      ))}
      {tab === 'applications' && (apps.length === 0 ? <EmptyState icon={<Briefcase className="size-6" aria-hidden />} title="No applications" action={<LinkButton to="/jobs">Find jobs</LinkButton>} /> : (
        <ul className="grid gap-2">{apps.map((a) => <li key={a.id}><Link to="/applications" className="card flex items-center justify-between gap-2 p-3"><span className="text-sm">{a.jobTitle} · {a.employerName}</span><StatusPill status={a.status} /></Link></li>)}</ul>
      ))}
      {tab === 'bookings' && (bookings.length === 0 ? <EmptyState icon={<CalendarDays className="size-6" aria-hidden />} title="No bookings" action={<LinkButton to="/events">Browse events</LinkButton>} /> : (
        <ul className="grid gap-3">{bookings.map((b) => (
          <li key={b.id} className="card grid gap-1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{b.title}</p><StatusPill status={b.status === 'demo_confirmed' ? 'confirmed (demo)' : b.status} /></div>
            <p className="text-sm text-muted">Ref <span className="font-mono">{b.reference}</span> · {b.date ? formatDate(b.date) : ''} · {formatINR(b.total)} · booked {timeAgo(b.createdAt)}</p>
            {b.status === 'demo_confirmed' && <Button size="sm" variant="ghost" className="justify-self-start" onClick={async () => { if (await confirm({ title: 'Cancel booking?', message: 'Demo bookings are cancelled instantly. Real bookings follow the organiser’s refund policy.', danger: true, confirmLabel: 'Cancel booking' })) { repo.patch('bookings', b.id, { status: 'cancelled' }); toast('Booking cancelled'); } }}>Cancel booking</Button>}
          </li>
        ))}</ul>
      ))}
      {tab === 'enquiries' && (enquiries.length === 0 ? <EmptyState icon={<MessageSquare className="size-6" aria-hidden />} title="No enquiries sent" /> : (
        <ul className="grid gap-2">{enquiries.map((q) => (
          <li key={q.id} className="card p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{q.targetName}</span><StatusPill status={q.status} /></div><p className="text-sm text-muted">“{q.message}”</p>{q.replies.map((r, i) => <p key={i} className="mt-1 rounded bg-page p-2 text-sm"><b>{r.from}:</b> {r.text}</p>)}</li>
        ))}</ul>
      ))}
      {tab === 'listings' && (listings.length === 0 ? <EmptyState title="No listings" action={<div className="flex flex-wrap justify-center gap-2"><LinkButton to="/marketplace/new">Sell an item</LinkButton><LinkButton variant="secondary" to="/property/new">List property</LinkButton><LinkButton variant="secondary" to="/businesses/new">List business</LinkButton></div>} /> : (
        <ul className="grid gap-2">{listings.map((l) => <li key={l.kind + l.id}><Link to={l.link} className="card flex items-center justify-between gap-2 p-3"><span className="text-sm"><Badge className="mr-2">{l.kind}</Badge>{l.title}</span><StatusPill status={l.status} /></Link></li>)}</ul>
      ))}
      {tab === 'rewards' && <div className="card flex flex-wrap items-center justify-between gap-3 p-4"><p><span className="text-2xl font-extrabold text-navy">{pointsTotal(userId)}</span> points · {db.vouchers.filter((v) => v.userId === userId).length} vouchers</p><div className="flex gap-2"><LinkButton to="/rewards">Rewards</LinkButton><LinkButton variant="secondary" to="/offers">My vouchers</LinkButton></div></div>}
    </div>
  );
}

/* ------------------------------- Settings ------------------------------- */

export function SettingsPage() {
  useDocumentTitle('Settings');
  const user = useCurrentUser();
  const { prefs, userId } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const { toast, confirm } = useUI();
  const [profile, setProfile] = useState({ name: user?.name ?? '', mobile: user?.mobile ?? '', email: user?.email ?? '', bio: user?.bio ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [push, setPush] = useState(pushState());
  const [delOpen, setDelOpen] = useState(false);
  const [delReason, setDelReason] = useState('');
  useEffect(() => { if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView(); }, [loc.hash]);
  const setP = (p: Partial<Preferences>) => { sessionStore.setPrefs(p); toast('Preferences saved'); };
  const toggleIn = (key: 'interests' | 'newsCategories' | 'jobCategories' | 'notifyCategories' | 'localities' | 'homeSections', v: string) => {
    const cur = prefs[key];
    setP({ [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<Preferences>);
  };
  const exportData = () => {
    const s = store.getState();
    const mine = {
      exportedAt: nowIso(), note: 'Demo export of data stored in this browser for your account.', user: s.users.find((u) => u.id === userId), preferences: prefs,
      saved: s.saved.filter((x) => x.userId === userId), posts: s.posts.filter((x) => x.userId === userId), comments: s.comments.filter((x) => x.userId === userId), votes: s.votes.filter((x) => x.userId === userId),
      serviceRequests: s.serviceRequests.filter((x) => x.userId === userId), applications: s.applications.filter((x) => x.userId === userId), bookings: s.bookings.filter((x) => x.userId === userId),
      enquiries: s.enquiries.filter((x) => x.fromUserId === userId), payments: s.payments.filter((x) => x.userId === userId), points: s.points.filter((x) => x.userId === userId)
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(mine, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'one-bhilwara-my-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Your data export has been downloaded');
  };
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <PageHeader title="Settings" subtitle="Profile, preferences, notifications and privacy." />
      {user ? (
        <section id="profile" className="card grid gap-3 p-4">
          <h2 className="font-bold text-navy">Edit profile</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" value={profile.name} error={errors.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            <TextField label="Mobile (optional)" inputMode="numeric" value={profile.mobile} error={errors.mobile} onChange={(e) => setProfile({ ...profile, mobile: e.target.value })} />
            <TextField label="Email (optional)" type="email" value={profile.email} error={errors.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            <Select label="Home locality" value={user.localityId} onChange={(e) => { repo.patch('users', user.id, { localityId: e.target.value }); sessionStore.setPrefs({ localityId: e.target.value }); toast('Locality updated'); }} options={LOCALITIES.filter((l) => l.id !== 'all').map((l) => ({ value: l.id, label: l.name }))} />
          </div>
          <TextArea label="About (optional)" value={profile.bio} maxLength={300} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
          <Button className="justify-self-start" onClick={() => {
            const e: Record<string, string> = {};
            if (sanitize(profile.name).length < 2) e.name = 'Enter your name.';
            if (profile.mobile && !isValidMobile(profile.mobile)) e.mobile = 'Enter a valid 10-digit mobile.';
            if (profile.email && !/^\S+@\S+\.\S+$/.test(profile.email)) e.email = 'Enter a valid email.';
            setErrors(e); if (Object.keys(e).length) return;
            repo.patch('users', user.id, { name: sanitize(profile.name, 80), mobile: profile.mobile.replace(/\D/g, '').slice(-10) || undefined, email: profile.email || undefined, bio: sanitize(profile.bio, 300) });
            toast('Profile saved');
          }}>Save profile</Button>
        </section>
      ) : <Notice tone="info">Sign in to edit your profile. Language and locality preferences work without an account.</Notice>}

      <section className="card grid gap-3 p-4">
        <h2 className="font-bold text-navy">Language & locality</h2>
        <Select label="Language / भाषा" value={prefs.lang} onChange={(e) => setP({ lang: e.target.value as 'en' | 'hi' })} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिंदी (Hindi)' }]} hint="Hindi covers navigation and main labels; some content is English-only for now." />
        <fieldset><legend className="label">Preferred localities</legend><div className="flex flex-wrap gap-2">{LOCALITIES.filter((l) => l.id !== 'all').map((l) => <button key={l.id} type="button" className="chip" aria-pressed={prefs.localities.includes(l.id)} onClick={() => toggleIn('localities', l.id)}>{l.name}</button>)}</div></fieldset>
      </section>

      <section id="personalisation" className="card grid gap-4 p-4">
        <h2 className="font-bold text-navy">Personalisation</h2>
        <fieldset><legend className="label">Interests</legend><div className="flex flex-wrap gap-2">{INTERESTS.map((i) => <button key={i} type="button" className="chip" aria-pressed={prefs.interests.includes(i)} onClick={() => toggleIn('interests', i)}>{i}</button>)}</div></fieldset>
        <fieldset><legend className="label">News categories (empty = all)</legend><div className="flex flex-wrap gap-2">{NEWS_CATEGORIES.map((c) => <button key={c.id} type="button" className="chip" aria-pressed={prefs.newsCategories.includes(c.id)} onClick={() => toggleIn('newsCategories', c.id)}>{c.name}</button>)}</div></fieldset>
        <fieldset><legend className="label">Job preferences</legend><div className="flex flex-wrap gap-2">{JOB_CATEGORIES.map((c) => <button key={c} type="button" className="chip" aria-pressed={prefs.jobCategories.includes(c)} onClick={() => toggleIn('jobCategories', c)}>{c}</button>)}</div></fieldset>
        <fieldset><legend className="label">Home sections</legend><div className="flex flex-wrap gap-2">{HOME_SECTIONS.map((c) => <button key={c.id} type="button" className="chip" aria-pressed={prefs.homeSections.includes(c.id)} onClick={() => toggleIn('homeSections', c.id)}>{c.name}</button>)}</div></fieldset>
        <p className="text-xs text-muted">We personalise only from what you choose here and your locality. We don’t infer sensitive attributes or use them for ads.</p>
        <Button variant="secondary" className="justify-self-start" onClick={async () => { if (await confirm({ title: 'Reset personalisation?', message: 'Interests, categories and home sections go back to defaults.' })) { const d = defaultPrefs(); sessionStore.setPrefs({ interests: d.interests, newsCategories: [], jobCategories: [], homeSections: d.homeSections }); toast('Personalisation reset'); } }}>Reset personalisation</Button>
      </section>

      <section id="notifications" className="card grid gap-3 p-4">
        <h2 className="font-bold text-navy">Notifications</h2>
        {[['alert', 'Civic alerts'], ['news', 'New local news'], ['comment', 'Replies & comments'], ['poll', 'Poll results'], ['service', 'Service request updates'], ['job', 'Job application updates'], ['job_match', 'New job matches'], ['property', 'Property enquiries'], ['booking', 'Booking status'], ['event', 'Event reminders'], ['business', 'Business enquiries'], ['campaign', 'Campaign status'], ['account', 'Account notices']].map(([k, label]) => (
          <Toggle key={k} label={label} checked={prefs.notifyCategories.includes(k)} onChange={() => toggleIn('notifyCategories', k)} />
        ))}
        <div className="rounded-lg bg-page p-3">
          <p className="flex items-center gap-2 font-semibold"><Smartphone className="size-4" aria-hidden />Push notifications on this device</p>
          <p className="text-sm text-muted">Get alerts like water-supply cuts or application updates even when the app is closed. We’ll only ask your browser for permission after you tap below.</p>
          <p className="mt-1 text-sm">Status: <b>{{ unsupported: 'Not supported by this browser', not_configured: 'Not configured yet (needs a push server & VAPID key)', default: 'Not enabled', granted: 'Permission granted (server subscription pending)', denied: 'Blocked in browser settings' }[push]}</b></p>
          <Button size="sm" className="mt-2" disabled={push !== 'default'} onClick={async () => { const r = await requestPush(); setPush(r); sessionStore.setPrefs({ pushAsked: true }); }}>Enable push</Button>
        </div>
      </section>

      {user && (
        <section id="privacy" className="card grid gap-2 p-4">
          <h2 className="font-bold text-navy">Privacy</h2>
          <Toggle label="Show my contact details on my public profile" checked={user.privacy.showContact} onChange={(v) => repo.patch('users', user.id, { privacy: { ...user.privacy, showContact: v } })} />
          <Toggle label="Public profile" description="Your name appears on posts and reviews either way." checked={user.privacy.profilePublic} onChange={(v) => repo.patch('users', user.id, { privacy: { ...user.privacy, profilePublic: v } })} />
          <Toggle label="Personalised feed" checked={user.privacy.personalisedFeed} onChange={(v) => repo.patch('users', user.id, { privacy: { ...user.privacy, personalisedFeed: v } })} />
          {user.blocked.length > 0 && <div className="text-sm"><p className="font-semibold">Blocked users</p>{user.blocked.map((b) => <div key={b} className="flex items-center justify-between py-1"><span>{store.getState().users.find((u) => u.id === b)?.name ?? b}</span><Button size="sm" variant="ghost" onClick={() => repo.patch('users', user.id, { blocked: user.blocked.filter((x) => x !== b) })}>Unblock</Button></div>)}</div>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Download className="size-4" aria-hidden />} onClick={exportData}>Export my data</Button>
            <Button variant="secondary" disabled title="Passwords are managed by the authentication provider once connected." onClick={() => undefined}>Change password (needs auth provider)</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setDelOpen(true)}>Request account deletion</Button>
          </div>
        </section>
      )}

      <section id="integrations" className="card grid gap-2 p-4">
        <h2 className="font-bold text-navy">Integrations status</h2>
        <ul className="grid gap-2">{integrations().map((i) => (
          <li key={i.id} className="flex items-start gap-2 text-sm">{i.configured ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden /> : <CircleX className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />}
            <span><b>{i.name}:</b> {i.configured ? 'Connected' : `Demo — ${i.mode}`}{!i.configured && <span className="block text-xs text-muted">Needs: {i.needs}</span>}</span></li>
        ))}</ul>
      </section>

      <section className="card flex flex-wrap gap-2 p-4">
        {userId && <Button variant="secondary" icon={<LogOut className="size-4" aria-hidden />} onClick={() => { sessionStore.set({ userId: null }); toast('Signed out'); nav('/'); }}>Sign out</Button>}
        <Button variant="ghost" onClick={async () => { if (await confirm({ title: 'Reset demo data?', message: 'Restores sample data and removes everything you created in this browser.', danger: true, confirmLabel: 'Reset' })) { store.reset(); sessionStore.reset(); toast('Demo data reset'); nav('/'); } }}>Reset demo data</Button>
      </section>

      <Dialog open={delOpen} onClose={() => setDelOpen(false)} title="Request account deletion"
        footer={<><Button variant="secondary" onClick={() => setDelOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => {
          fileReport('complaint', 'account', userId!, `Account deletion request: ${user?.name}`, 'Account deletion request', delReason);
          setDelOpen(false); toast('Deletion request recorded. In production we confirm by OTP and delete within the stated retention period.');
        }}>Submit request</Button></>}>
        <p className="text-sm">We’ll delete your profile and personal data, except records we must keep by law (e.g. invoices). Public posts may be anonymised instead of deleted.</p>
        <div className="mt-3"><TextArea label="Reason (optional)" value={delReason} onChange={(e) => setDelReason(e.target.value)} /></div>
      </Dialog>
    </div>
  );
}

/* ------------------------------- Sign in (demo) ------------------------------- */

export function SignInPage() {
  useDocumentTitle('Sign in');
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { toast } = useUI();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const next = params.get('next') || '/';
  const finish = (userId: string) => { sessionStore.set({ userId, role: 'resident' }); toast('Signed in (demo)'); nav(next); };
  return (
    <div className="mx-auto grid max-w-md gap-5">
      <PageHeader title={mode === 'signin' ? 'Sign in' : 'Create account'} subtitle="Demo authentication — no real OTP is sent." />
      <Notice tone="demo" title="Demo account flow">Real sign-in (OTP/password) requires an authentication provider such as Supabase Auth. Here, any 6-digit code works and data stays in this browser. This is not secure authentication.</Notice>
      <Tabs label="Account" value={mode} onChange={(m) => { setMode(m); setSent(false); setErr(''); }} tabs={[{ id: 'signin', label: 'Sign in' }, { id: 'signup', label: 'Sign up' }]} />
      <form className="card grid gap-4 p-4" noValidate onSubmit={(e) => {
        e.preventDefault();
        if (mode === 'signup' && sanitize(name).length < 2) return setErr('Enter your name.');
        if (!isValidMobile(mobile)) return setErr('Enter a valid 10-digit Indian mobile number.');
        if (!sent) { setSent(true); setErr(''); toast('Demo: enter any 6-digit code', 'info'); return; }
        if (!/^\d{6}$/.test(otp)) return setErr('Enter the 6-digit code.');
        const digits = mobile.replace(/\D/g, '').slice(-10);
        const existing = store.getState().users.find((u) => u.mobile === digits);
        if (existing) return finish(existing.id);
        if (mode === 'signin') { finish(DEMO_USER_ID); return; }
        const id = uid('u');
        repo.insert('users', { id, name: sanitize(name, 80), mobile: digits, localityId: sessionStore.get().prefs.localityId === 'all' ? 'shastri-nagar' : sessionStore.get().prefs.localityId, role: 'resident', interests: [], status: 'active', privacy: { showContact: false, profilePublic: true, personalisedFeed: true }, following: [], blocked: [], createdAt: nowIso(), demo: true });
        finish(id);
      }}>
        {mode === 'signup' && <TextField label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
        <TextField label="Mobile number" inputMode="numeric" autoComplete="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="98765 43210" />
        {sent && <TextField label="One-time code" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} hint="Demo: any 6 digits" />}
        {err && <p className="text-sm font-medium text-danger" role="alert">{err}</p>}
        <Button type="submit">{sent ? 'Verify & continue' : 'Send code'}</Button>
        <Button variant="ghost" onClick={() => finish(DEMO_USER_ID)}>Continue with the demo account</Button>
        <p className="text-xs text-muted">By continuing you agree to the <Link className="underline" to="/terms">Terms</Link> and <Link className="underline" to="/privacy">Privacy Policy</Link>. We never store passwords in this demo.</p>
      </form>
    </div>
  );
}

/* ------------------------------- Help ------------------------------- */

const FAQ = [
  ['Is One Bhilwara a government service?', 'No. We summarise public information and link to official portals. Always apply through official channels.'],
  ['Are listings verified?', 'Only records with the “Verified” badge have passed a One Bhilwara check. Everything in this demo is sample data and labelled.'],
  ['Does One Bhilwara charge job seekers?', 'Never. Applying for jobs is free. Report anyone asking for money.'],
  ['How do I report something?', 'Use the flag “Report” button on any listing, post, comment or review. Moderators review the queue.'],
  ['What works offline?', 'Pages you’ve opened before and the app shell. Searching new data, AI answers, bookings and live weather need a connection.']
];

export function HelpPage() {
  useDocumentTitle('Help & support');
  const { canInstall, install } = usePWA();
  const guard = useRequireAuth();
  const { toast } = useUI();
  const [f, setF] = useState({ topic: 'General question', message: '' });
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <PageHeader title="Help & support" />
      <section className="card p-4">
        <h2 className="mb-2 flex items-center gap-2 font-bold text-danger"><Phone className="size-5" aria-hidden />Emergency numbers</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">{EMERGENCY_NUMBERS.map((n) => <li key={n.num}><a href={`tel:${n.num}`} className="block rounded-lg border border-line p-2 text-center"><span className="block text-lg font-extrabold text-danger">{n.num}</span><span className="text-xs">{n.label}</span></a></li>)}</ul>
      </section>
      <section id="install" className="card grid gap-2 p-4">
        <h2 className="font-bold text-navy">Install One Bhilwara</h2>
        {canInstall && <Button className="justify-self-start" onClick={async () => { if (await install()) toast('Installed!'); }}>Install now</Button>}
        <ul className="list-disc pl-5 text-sm"><li><b>Android (Chrome):</b> menu ⋮ → “Install app” or “Add to Home screen”.</li><li><b>iPhone (Safari):</b> Share → “Add to Home Screen”.</li><li><b>Desktop (Chrome/Edge):</b> install icon in the address bar.</li></ul>
      </section>
      <section className="card p-4"><h2 className="mb-2 font-bold text-navy">FAQs</h2>{FAQ.map(([q, a]) => <details key={q} className="border-b border-line py-2 last:border-0"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-1 text-sm text-muted">{a}</p></details>)}</section>
      <form className="card grid gap-3 p-4" onSubmit={(e) => { e.preventDefault(); guard(() => {
        if (sanitize(f.message).length < 10) { toast('Please describe the issue (10+ characters).', 'error'); return; }
        fileReport(f.topic === 'Dispute' ? 'dispute' : 'complaint', 'support', 'support', f.topic, f.topic, f.message); setF({ ...f, message: '' }); toast('Support request received (demo queue)');
      }); }}>
        <h2 className="font-bold text-navy">Contact support / complaints</h2>
        <Select label="Topic" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} options={['General question', 'Problem with a listing', 'Complaint about a provider', 'Dispute', 'Payment or refund', 'Privacy request']} />
        <TextArea label="Message" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
        <Button type="submit" className="justify-self-start">Send</Button>
      </form>
      <section className="card p-4"><h2 className="mb-2 font-bold text-navy">Policies</h2><ul className="grid gap-1 text-sm sm:grid-cols-2">{POLICIES.map((p) => <li key={p.slug}><Link className="text-teal underline" to={`/policies/${p.slug}`}>{p.title}</Link></li>)}</ul></section>
      <section className="card p-4 text-sm text-muted"><h2 className="mb-1 font-bold text-navy">Safety tips</h2><ul className="list-disc pl-5"><li>Never share OTPs or pay advances to strangers.</li><li>Meet in public places for marketplace deals.</li><li>Verify property and vehicle documents in person.</li></ul></section>
    </div>
  );
}

/* ------------------------------- Policies (drafts) ------------------------------- */

const POLICIES: { slug: string; title: string; sections: [string, string][] }[] = [
  { slug: 'privacy', title: 'Privacy Policy', sections: [['What we collect', 'Account details you provide (name, mobile, locality), content you post, enquiries you send with consent, and basic usage data needed to run the service.'], ['How we use it', 'To provide features, personalise by the locality and interests you choose, prevent abuse, and with consent, share enquiry details with the provider you select.'], ['What we don’t do', 'We don’t sell personal data, infer sensitive attributes, or target ads using sensitive information such as health, religion or caste.'], ['Your choices', 'Edit or export your data, adjust privacy settings, and request deletion from Settings.'], ['Retention', 'We keep data only as long as needed for the service or legal obligations (e.g. invoices).']] },
  { slug: 'terms', title: 'Terms of Use', sections: [['The service', 'One Bhilwara is a discovery and communication platform. It is not a government authority, bank, employer, broker or service provider.'], ['Your content', 'You are responsible for what you post. Don’t post unlawful, misleading or harmful content.'], ['Transactions', 'Deals are between you and the other party unless a feature explicitly says otherwise.'], ['Accounts', 'Keep your account secure. We may suspend accounts that break these terms.']] },
  { slug: 'community-guidelines', title: 'Community Guidelines', sections: [['Be respectful', 'No harassment, hate speech, threats or personal attacks.'], ['Be accurate', 'Don’t spread misinformation. Mark opinions as opinions.'], ['Protect privacy', 'Don’t post other people’s phone numbers, addresses or photos without consent.'], ['Moderation', 'Reported content is reviewed. Repeat violations lead to restrictions.']] },
  { slug: 'advertising-policy', title: 'Advertising Policy', sections: [['Labelling', 'All paid placements are labelled “Sponsored” or “Promoted”.'], ['Prohibited', 'Misleading claims, prohibited products, and targeting using sensitive attributes.'], ['Review', 'Creatives are reviewed before going live. Results are not guaranteed.']] },
  { slug: 'refund-cancellation', title: 'Refund & Cancellation Policy', sections: [['Subscriptions', 'Cancel anytime; access continues until the end of the paid period.'], ['Bookings', 'Event and service bookings follow the organiser’s or provider’s stated policy.'], ['Requests', 'Submit refund requests from Payments; we respond within the stated timeline.']] },
  { slug: 'service-provider-terms', title: 'Service Provider Terms', sections: [['Accuracy', 'Keep pricing, availability and credentials accurate.'], ['Conduct', 'Turn up as agreed, quote fairly, and resolve complaints in good faith.'], ['Fees', 'Any lead fees or commissions are disclosed before they apply.']] },
  { slug: 'business-listing-terms', title: 'Business Listing Terms', sections: [['Ownership', 'Only owners or authorised staff may claim and edit a listing.'], ['Verification', 'The verified badge requires document review and can be withdrawn.'], ['Reviews', 'Businesses can reply to reviews but cannot remove them; incentivised reviews are not allowed.']] }
];

export function PolicyPage() {
  const { slug } = useParams();
  const loc = useLocation();
  const key = slug ?? (loc.pathname === '/privacy' ? 'privacy' : 'terms');
  const p = POLICIES.find((x) => x.slug === key);
  useDocumentTitle(p?.title ?? 'Policy');
  if (!p) return <NotFound />;
  return (
    <article className="mx-auto grid max-w-3xl gap-4">
      <PageHeader title={p.title} badge={<Badge tone="amber">Draft — pending legal review</Badge>} />
      <Notice tone="warning">This is structured draft content for the prototype. It must be reviewed by a qualified lawyer before launch. Its existence does not mean the app is legally compliant.</Notice>
      {p.sections.map(([h, t]) => <section key={h} className="card p-4"><h2 className="font-bold text-navy">{h}</h2><p className="mt-1 text-sm">{t}</p></section>)}
      <nav className="flex flex-wrap gap-2">{POLICIES.filter((x) => x.slug !== p.slug).map((x) => <Link key={x.slug} className="chip" to={`/policies/${x.slug}`}>{x.title}</Link>)}</nav>
    </article>
  );
}

/* ------------------------------- Pricing, checkout, payments ------------------------------- */

export function PricingPage() {
  useDocumentTitle('Plans & pricing');
  const [params, setParams] = useSearchParams();
  const audience = (params.get('audience') as 'business' | 'employer' | 'property') ?? 'business';
  const plans = useDB((s) => s.settings.plans.filter((p) => p.audience === audience));
  const allFeatures = Array.from(new Set(plans.flatMap((p) => p.features)));
  return (
    <div className="grid gap-5">
      <PageHeader title="Plans & pricing" subtitle="Optional paid features for businesses, employers and property owners. Residents never pay to use One Bhilwara." badge={<DemoBadge label="Illustrative prices" />} />
      <Tabs label="Audience" value={audience} onChange={(a) => setParams({ audience: a }, { replace: true })} tabs={[{ id: 'business', label: 'Businesses' }, { id: 'employer', label: 'Employers' }, { id: 'property', label: 'Property' }]} />
      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className="card grid content-start gap-3 p-5">
            <p className="font-bold">{p.name}</p>
            <p className="text-3xl font-extrabold text-navy">{p.price ? formatINR(p.price) : 'Free'}{p.price > 0 && <span className="text-sm font-normal text-muted">/{p.period} + GST</span>}</p>
            <ul className="grid gap-1 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="size-4 shrink-0 text-teal" aria-hidden />{f}</li>)}</ul>
            {p.price ? <LinkButton to={`/checkout?plan=${p.id}`}>Choose {p.name}</LinkButton> : <LinkButton variant="secondary" to="/businesses/new">Get started free</LinkButton>}
          </div>
        ))}
      </div>
      {plans.length > 1 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm"><caption className="p-3 text-left font-bold text-navy">Compare plans</caption>
            <thead><tr className="border-y border-line"><th className="p-3 text-left font-medium text-muted">Feature</th>{plans.map((p) => <th key={p.id} className="p-3 font-semibold">{p.name}</th>)}</tr></thead>
            <tbody>{allFeatures.map((f) => <tr key={f} className="border-b border-line last:border-0"><td className="p-3">{f}</td>{plans.map((p) => <td key={p.id} className="p-3 text-center">{p.features.includes(f) ? <Check className="mx-auto size-4 text-teal" aria-label="Included" /> : <span className="text-muted" aria-label="Not included">—</span>}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">Prices and fees are configurable by admins and shown here for demonstration. No fees apply to job applications, essential government information or emergency services.</p>
    </div>
  );
}

export function CheckoutPage() {
  useDocumentTitle('Checkout');
  const [params] = useSearchParams();
  const plan = useDB((s) => s.settings.plans.find((p) => p.id === params.get('plan')));
  const gst = useDB((s) => s.settings.fees.gstPercent);
  const [fail, setFail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Payment | null>(null);
  if (!plan) return <EmptyState title="Choose a plan first" action={<LinkButton to="/pricing">See plans</LinkButton>} />;
  const tax = Math.round((plan.price * gst) / 100);
  if (result) return <PaymentResult p={result} />;
  return (
    <div className="mx-auto grid max-w-lg gap-5">
      <PageHeader title="Checkout" badge={<DemoBadge label="Demo checkout" />} />
      <Notice tone="demo" title="No real payment">This simulates checkout. No gateway is contacted and no money moves. A real integration creates the order on a server and confirms payment via a verified webhook.</Notice>
      <section className="card grid gap-2 p-4">
        <h2 className="font-bold text-navy">Order summary</h2>
        <div className="flex justify-between text-sm"><span>{plan.name} (1 {plan.period})</span><span>{formatINR(plan.price)}</span></div>
        <div className="flex justify-between text-sm"><span>GST ({gst}%)</span><span>{formatINR(tax)}</span></div>
        <div className="flex justify-between border-t border-line pt-2 font-bold"><span>Total</span><span>{formatINR(plan.price + tax)}</span></div>
        <p className="text-xs text-muted">Renews monthly until cancelled. Cancel anytime from Payments. See the Refund & Cancellation Policy.</p>
      </section>
      <Checkbox checked={fail} onChange={setFail} label="Simulate a failed payment (for testing)" />
      <Button loading={busy} onClick={async () => { setBusy(true); const p = await demoCheckout({ description: plan.name, amount: plan.price, kind: 'subscription', plan: plan.id }, fail); setBusy(false); setResult(p); }}>Pay {formatINR(plan.price + tax)} (demo)</Button>
    </div>
  );
}

function PaymentResult({ p }: { p: Payment }) {
  const ok = p.status === 'demo_success';
  return (
    <div className="mx-auto grid max-w-lg gap-4">
      <div className="card grid justify-items-center gap-2 p-6 text-center">
        {ok ? <CircleCheck className="size-12 text-teal" aria-hidden /> : <CircleX className="size-12 text-danger" aria-hidden />}
        <h1 className="text-xl font-extrabold text-navy">{ok ? 'Demo payment recorded' : 'Demo payment failed'}</h1>
        <p className="text-sm text-muted">{ok ? 'No real money was charged. Your demo subscription is active.' : 'Nothing was charged. You can try again.'}</p>
        {ok && <p className="font-mono text-sm">{p.invoiceNo}</p>}
      </div>
      <div className="flex gap-2"><LinkButton to="/payments">View payments & invoices</LinkButton>{!ok && <LinkButton variant="secondary" to="/pricing">Back to plans</LinkButton>}</div>
    </div>
  );
}

export function PaymentsPage() {
  useDocumentTitle('Payments');
  const { userId, role } = useSession();
  const ids = actorIds(userId, role);
  const payments = useDB((s) => s.payments.filter((p) => ids.includes(p.userId)));
  const plans = useDB((s) => s.settings.plans);
  const [invoice, setInvoice] = useState<Payment | null>(null);
  const { toast, confirm } = useUI();
  const active = useMemo(() => payments.find((p) => p.kind === 'subscription' && p.status === 'demo_success'), [payments]);
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <PageHeader title="Payments & invoices" badge={<DemoBadge label="Demo transactions" />} />
      <section className="card p-4">
        <h2 className="font-bold text-navy">Subscription</h2>
        {active ? (<>
          <p className="text-sm">{plans.find((p) => p.id === active.plan)?.name ?? active.description} · started {formatDate(active.createdAt)} <StatusPill status="active" /></p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={async () => { if (await confirm({ title: 'Cancel subscription?', message: 'Access continues until the end of the current period. No further renewals.', danger: true, confirmLabel: 'Cancel subscription' })) toast('Subscription set to cancel at period end (demo)'); }}>Cancel subscription</Button>
        </>) : <p className="text-sm text-muted">No active subscription. <Link className="underline" to="/pricing">See plans</Link></p>}
      </section>
      {payments.length === 0 ? <EmptyState icon={<Receipt className="size-6" aria-hidden />} title="No payments yet" /> : (
        <ul className="card divide-y divide-line">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="min-w-0 flex-1"><span className="block font-semibold">{p.description}</span><span className="text-sm text-muted">{formatDateTime(p.createdAt)} · {p.invoiceNo}</span></span>
              <span className="font-semibold">{formatINR(p.amount + p.gst)}</span>
              <StatusPill status={p.status.replace('demo_', '')} />
              <Button size="sm" variant="secondary" icon={<FileText className="size-4" aria-hidden />} onClick={() => setInvoice(p)}>Invoice</Button>
              {p.status === 'demo_success' && <Button size="sm" variant="ghost" onClick={() => { repo.patch('payments', p.id, { status: 'refund_requested' }); fileReport('dispute', 'payment', p.id, p.description, 'Refund request', ''); toast('Refund request submitted (demo)'); }}>Request refund</Button>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!invoice} onClose={() => setInvoice(null)} title="Invoice (demo)" footer={<Button variant="secondary" onClick={() => window.print()}>Print</Button>}>
        {invoice && (
          <div className="grid gap-2 text-sm">
            <p className="font-bold text-navy">One Bhilwara</p><p className="text-muted">DEMO INVOICE — not a tax invoice. No payment was processed.</p>
            <p>Invoice no: <span className="font-mono">{invoice.invoiceNo}</span></p><p>Date: {formatDate(invoice.createdAt)}</p>
            <div className="flex justify-between border-t border-line pt-2"><span>{invoice.description}</span><span>{formatINR(invoice.amount)}</span></div>
            <div className="flex justify-between"><span>GST</span><span>{formatINR(invoice.gst)}</span></div>
            <div className="flex justify-between border-t border-line pt-2 font-bold"><span>Total</span><span>{formatINR(invoice.amount + invoice.gst)}</span></div>
            <p>Status: {invoice.status.replace('_', ' ')}</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

