import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Bookmark, Briefcase, CalendarDays, ChevronRight, ClipboardList, Globe, House, Landmark, LayoutGrid, MessageSquare, MessagesSquare, Newspaper, Plus, Sparkles, Vote, Wrench } from 'lucide-react';
import { useCurrentUser, useDB, useDocumentTitle, useSession, useT } from '@/hooks/useStore';
import { serviceName } from '@/config/catalog';
import { Avatar, Button, cx, EmptyState, LinkButton, PageHeader, SectionHeader, StatusPill } from '@/components/ui/primitives';
import { PostSheet } from '@/layouts/AppShell';
import { timeAgo } from '@/utils/format';
import { recommend, type RecKind } from './recommend';

const REC_STYLE: Record<RecKind, { I: typeof Wrench; tint: string; label: string }> = {
  job: { I: Briefcase, tint: 'bg-emerald-50 text-emerald-600', label: 'Job' },
  service: { I: Wrench, tint: 'bg-brand-50 text-brand', label: 'Service' },
  event: { I: CalendarDays, tint: 'bg-fuchsia-50 text-fuchsia-600', label: 'Event' },
  property: { I: House, tint: 'bg-purple-50 text-purple-600', label: 'Property' },
  scheme: { I: Landmark, tint: 'bg-amber-50 text-amber-700', label: 'Scheme' },
  news: { I: Newspaper, tint: 'bg-rose-50 text-rose-600', label: 'News' },
  media: { I: Globe, tint: 'bg-sky-50 text-sky-600', label: 'Channel' },
  module: { I: LayoutGrid, tint: 'bg-slate-100 text-ink', label: 'Explore' }
};

type Item = { id: string; at: string; title: string; detail: string; link: string; I: typeof Wrench; tint: string; status?: string };

export function ActivityPage() {
  useDocumentTitle('My Activity');
  const t = useT();
  const user = useCurrentUser();
  const { userId, prefs } = useSession();
  const db = useDB((s) => s);
  const [post, setPost] = useState(false);

  const mine = useMemo(() => {
    const by = <T extends { userId?: string }>(l: T[]) => (userId ? l.filter((x) => x.userId === userId) : []);
    return {
      requests: by(db.serviceRequests), apps: by(db.applications), bookings: by(db.bookings), posts: by(db.posts), comments: by(db.comments), votes: by(db.votes),
      enquiries: userId ? db.enquiries.filter((q) => q.fromUserId === userId) : [], saved: userId ? db.saved.filter((s) => s.userId === userId) : [],
      unread: userId ? db.notifications.filter((n) => (n.userId === userId || n.userId === 'all') && !n.read && prefs.notifyCategories.includes(n.type)).length : 0
    };
  }, [db, userId, prefs.notifyCategories]);

  const timeline = useMemo<Item[]>(() => {
    const items: Item[] = [
      ...mine.requests.map((r) => ({ id: `r${r.id}`, at: r.createdAt, title: `Service request · ${serviceName(r.category)}`, detail: r.description, link: `/service-requests/${r.id}`, I: Wrench, tint: 'bg-brand-50 text-brand', status: r.status })),
      ...mine.apps.map((a) => ({ id: `a${a.id}`, at: a.createdAt, title: `Applied · ${a.jobTitle}`, detail: a.employerName, link: '/applications', I: Briefcase, tint: 'bg-emerald-50 text-emerald-600', status: a.status })),
      ...mine.bookings.map((b) => ({ id: `b${b.id}`, at: b.createdAt, title: `Booking · ${b.title}`, detail: `Ref ${b.reference}`, link: '/profile?tab=bookings', I: CalendarDays, tint: 'bg-fuchsia-50 text-fuchsia-600', status: b.status === 'demo_confirmed' ? 'confirmed (demo)' : b.status })),
      ...mine.enquiries.map((q) => ({ id: `q${q.id}`, at: q.createdAt, title: `Enquiry · ${q.targetName}`, detail: q.message, link: '/profile?tab=enquiries', I: MessageSquare, tint: 'bg-sky-50 text-sky-600', status: q.status })),
      ...mine.posts.map((p) => ({ id: `p${p.id}`, at: p.createdAt, title: 'You posted in Community', detail: p.text, link: `/community/${p.id}`, I: MessagesSquare, tint: 'bg-violet-50 text-violet-600' })),
      ...mine.comments.map((c) => ({ id: `c${c.id}`, at: c.createdAt, title: 'You commented', detail: c.text, link: c.targetType === 'post' ? `/community/${c.targetId}` : `/news/${c.targetId}`, I: MessageSquare, tint: 'bg-slate-100 text-ink' })),
      ...mine.votes.map((v) => ({ id: `v${v.id}`, at: v.createdAt, title: 'You voted in a poll', detail: db.polls.find((p) => p.id === v.pollId)?.question ?? '', link: `/polls/${v.pollId}`, I: Vote, tint: 'bg-amber-50 text-amber-700' })),
      ...mine.saved.map((s) => ({ id: `s${s.type}${s.id}`, at: s.at, title: 'Saved for later', detail: s.type, link: '/profile?tab=saved', I: Bookmark, tint: 'bg-rose-50 text-rose-600' }))
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  }, [mine, db.polls]);

  const recs = useMemo(() => recommend(db, prefs, userId), [db, prefs, userId]);

  const tiles = [
    { to: '/service-requests', label: 'Requests', n: mine.requests.length, I: ClipboardList, tint: 'from-sky-500 to-blue-600' },
    { to: '/applications', label: 'Applications', n: mine.apps.length, I: Briefcase, tint: 'from-emerald-500 to-teal-600' },
    { to: '/profile?tab=bookings', label: 'Bookings', n: mine.bookings.length, I: CalendarDays, tint: 'from-fuchsia-500 to-pink-600' },
    { to: '/profile?tab=enquiries', label: 'Enquiries', n: mine.enquiries.length, I: MessageSquare, tint: 'from-indigo-500 to-violet-600' },
    { to: '/profile?tab=saved', label: 'Saved', n: mine.saved.length, I: Bookmark, tint: 'from-rose-500 to-red-500' },
    { to: '/notifications', label: 'Alerts', n: mine.unread, I: Bell, tint: 'from-amber-400 to-orange-500' }
  ];

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title="My Activity" subtitle="Everything you’ve done, and picks for you." actions={<Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setPost(true)}>Create</Button>} />

      {user ? (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand to-indigo-600 p-4 text-white shadow-md">
            <Avatar name={user.name} size={44} />
            <div className="min-w-0 flex-1"><p className="font-bold">Hi, {user.name.split(' ')[0]}</p><p className="text-sm text-white/85">{timeline.length ? `Last active ${timeAgo(timeline[0].at)}` : 'Your activity will show up here.'}</p></div>
            <Link to="/profile" className="shrink-0 rounded-lg bg-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/30">{t('navProfile')}</Link>
          </div>

          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Activity summary">
            {tiles.map(({ to, label, n, I, tint }) => (
              <li key={to}><Link to={to} className="card flex flex-col items-center gap-1.5 p-3 text-center hover:border-brand/30">
                <span className={cx('grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white', tint)}><I className="size-5" aria-hidden /></span>
                <span className="text-lg font-extrabold leading-none text-ink">{n}</span><span className="text-xs font-medium text-muted">{label}</span>
              </Link></li>
            ))}
          </ul>

          <section aria-labelledby="recent-h">
            <SectionHeader title="Recent activity" to="/profile" linkLabel="See all" />
            <h2 id="recent-h" className="sr-only">Recent activity</h2>
            {timeline.length === 0 ? (
              <EmptyState title="Nothing yet" text="Book a service, apply to a job or post in Community — it’ll appear here." action={<Button onClick={() => setPost(true)}>Create something</Button>} />
            ) : (
              <ol className="card divide-y divide-line">
                {timeline.map((it) => (
                  <li key={it.id}><Link to={it.link} className="flex items-center gap-3 p-3 hover:bg-page">
                    <span className={cx('grid size-10 shrink-0 place-items-center rounded-full', it.tint)}><it.I className="size-5" aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{it.title}</span><span className="block truncate text-xs text-muted">{it.detail}</span></span>
                    <span className="flex shrink-0 flex-col items-end gap-1">{it.status && <StatusPill status={it.status} />}<span className="text-[11px] text-muted">{timeAgo(it.at)}</span></span>
                  </Link></li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : (
        <EmptyState title="Sign in to see your activity" text="Your requests, applications, bookings and saved items appear here." action={<LinkButton to="/signin?next=/activity">{t('signIn')}</LinkButton>} />
      )}

      <section aria-labelledby="recs-h">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="recs-h" className="flex items-center gap-2 text-lg font-bold text-ink"><Sparkles className="size-5 text-amber" aria-hidden />{t('recommended')}</h2>
          <Link to="/settings#personalisation" className="text-sm font-semibold text-brand hover:underline">Edit interests</Link>
        </div>
        {recs.length === 0 ? <p className="text-sm text-muted">Choose interests in Settings to get recommendations.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recs.map((r) => {
              const s = REC_STYLE[r.kind];
              return (
                <li key={r.id}><Link to={r.link} className="card flex h-full items-center gap-3 p-3 hover:border-brand/30">
                  <span className={cx('grid size-12 shrink-0 place-items-center rounded-2xl', s.tint)}><s.I className="size-6" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{s.label}</span>
                    <span className="block truncate font-semibold text-ink">{r.title}</span>
                    {r.detail && <span className="block truncate text-xs text-ink/70">{r.detail}</span>}
                    <span className="block truncate text-xs text-brand">{r.why}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                </Link></li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Based only on your interests, localities, followed channels and activity in this app.</p>
      </section>
      <PostSheet open={post} onClose={() => setPost(false)} />
    </div>
  );
}
