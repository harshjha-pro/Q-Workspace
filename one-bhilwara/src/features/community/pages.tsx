import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, Clock, Download, EyeOff, Lock, MessageCircle, Plus, Share2, ThumbsDown, ThumbsUp, Users, Vote } from 'lucide-react';
import type { Poll, Post } from '@/types/models';
import { LOCALITIES, localityName } from '@/config/catalog';
import { useCurrentUser, useDB, useDocumentTitle, useLoading, useNow, useSession } from '@/hooks/useStore';
import { awardPoints, notify, sanitize } from '@/services/domain/common';
import { canVote, isRevealed, participation, pollPhase, pollResults, userVote } from '@/services/domain/polls';
import { repo } from '@/services/store';
import { BarList, CommentsThread, LoadMore, LOCALITY_OPTIONS, ReportButton, ShareButton, useRequireAuth, usePaged } from '@/components/shared';
import { Avatar, Badge, Button, cx, DemoBadge, EmptyState, LinkButton, Notice, PageHeader, SkeletonList, StatusPill } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { Checkbox, FilePicker, Select, TextArea, TextField } from '@/components/ui/form';
import { countdown, formatDate, formatDateTime, timeAgo } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';
import NotFound from '@/app/NotFound';

const KINDS: { id: Post['kind']; label: string }[] = [
  { id: 'question', label: 'Question' }, { id: 'discussion', label: 'Discussion' }, { id: 'suggestion', label: 'Suggestion' }, { id: 'recommendation', label: 'Recommendation' },
  { id: 'announcement', label: 'Announcement' }, { id: 'photo', label: 'Local photo' }, { id: 'event', label: 'Event update' }
];
const REACTIONS = [{ id: 'like', label: 'Like', I: ThumbsUp }, { id: 'helpful', label: 'Helpful', I: Users }, { id: 'disagree', label: 'Disagree', I: ThumbsDown }];

export function CommunityPage() {
  useDocumentTitle('Community');
  const loading = useLoading();
  const [kind, setKind] = useState<'all' | Post['kind']>('all');
  const [loc, setLoc] = useState('');
  const [params, setParams] = useSearchParams();
  const [compose, setCompose] = useState(false);
  const user = useCurrentUser();
  const guardOpen = useRequireAuth();
  useEffect(() => { if (params.get('compose') === '1') { setParams({}, { replace: true }); guardOpen(() => setCompose(true)); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const posts = useDB((s) => s.posts.filter((p) => p.status === 'published' || (p.status === 'pending' && p.userId === user?.id)));
  const list = posts.filter((p) => (kind === 'all' || p.kind === kind) && (!loc || p.localityId === loc) && !(user?.blocked ?? []).includes(p.userId));
  const { visible, hasMore, more } = usePaged(list, 8);
  const guard = useRequireAuth();
  return (
    <div className="grid gap-5">
      <PageHeader title="Community" subtitle="Ask, discuss and share with neighbours. Keep it local and respectful."
        actions={<><LinkButton variant="secondary" to="/polls" icon={<Vote className="size-4" aria-hidden />}>Polls</LinkButton><Button icon={<Plus className="size-4" aria-hidden />} onClick={() => guard(() => setCompose(true))}>New post</Button></>} />
      <Tabs label="Post type" value={kind} onChange={setKind} tabs={[{ id: 'all', label: 'All' }, ...KINDS.map((k) => ({ id: k.id, label: k.label }))]} />
      <select aria-label="Locality" className="input min-h-10 w-full text-sm sm:w-60" value={loc} onChange={(e) => setLoc(e.target.value)}>
        <option value="">All localities</option>{LOCALITY_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      {loading ? <SkeletonList /> : list.length === 0 ? (
        <EmptyState icon={<MessageCircle className="size-6" aria-hidden />} title="No posts yet" text="Start a conversation for your locality." action={<Button onClick={() => guard(() => setCompose(true))}>Create a post</Button>} />
      ) : (
        <>
          <ul className="grid gap-3">{visible.map((p) => <li key={p.id}><PostCard p={p} /></li>)}</ul>
          <LoadMore hasMore={hasMore} onMore={more} />
        </>
      )}
      <ComposeDialog open={compose} onClose={() => setCompose(false)} />
    </div>
  );
}

function PostCard({ p, full }: { p: Post; full?: boolean }) {
  const { userId } = useSession();
  const guard = useRequireAuth();
  const commentCount = useDB((s) => s.comments.filter((c) => c.targetType === 'post' && c.targetId === p.id).length);
  const kindLabel = KINDS.find((k) => k.id === p.kind)?.label;
  return (
    <article className="card p-4">
      <div className="flex items-center gap-3">
        <Avatar name={p.userName} size={36} />
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{p.userName}</p><p className="text-xs text-muted">{localityName(p.localityId)} · {timeAgo(p.createdAt)}</p></div>
        <Badge tone="navy">{kindLabel}</Badge>
        {p.status === 'pending' && <Badge tone="blue">Awaiting moderation</Badge>}
      </div>
      {full ? <p className="mt-3 whitespace-pre-line text-[15px]">{p.text}</p> : <Link to={`/community/${p.id}`} className="mt-3 block text-[15px] hover:text-brand">{p.text}</Link>}
      {p.photo && <div className="mt-3 grid h-40 place-items-center rounded-xl bg-navy-50 text-muted"><Camera className="size-8" aria-hidden /><span className="sr-only">Photo placeholder</span></div>}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {REACTIONS.map(({ id, label, I }) => {
          const users = p.reactions[id] ?? [];
          const on = !!userId && users.includes(userId);
          return (
            <button key={id} type="button" aria-pressed={on} onClick={() => guard(() => repo.at('posts').mutate(p.id, (cur) => ({ reactions: { ...cur.reactions, [id]: on ? (cur.reactions[id] ?? []).filter((x) => x !== userId) : [...(cur.reactions[id] ?? []), userId!] } })))}
              className={cx('inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-medium', on ? 'bg-brand text-white' : 'bg-page text-ink hover:bg-brand-50')}>
              <I className="size-4" aria-hidden />{label}{users.length > 0 && <span className="tabular-nums">· {users.length}</span>}
            </button>
          );
        })}
        {!full && <Link to={`/community/${p.id}`} className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted hover:bg-page"><MessageCircle className="size-4" aria-hidden />{commentCount}</Link>}
        <span className="ml-auto flex"><ShareButton title="Community post" path={`/community/${p.id}`} compact /><ReportButton targetType="post" targetId={p.id} title={p.text.slice(0, 60)} compact /></span>
      </div>
    </article>
  );
}

function ComposeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useCurrentUser();
  const { prefs } = useSession();
  const { toast } = useUI();
  const [kind, setKind] = useState<Post['kind']>('question');
  const [text, setText] = useState('');
  const [loc, setLoc] = useState(prefs.localityId === 'all' ? 'shastri-nagar' : prefs.localityId);
  const [photos, setPhotos] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const submit = () => {
    const t = sanitize(text, 2000);
    if (t.length < 10) return setErr('Please write at least 10 characters.');
    // Announcements go to moderation first; other posts publish immediately with post-moderation.
    const status = kind === 'announcement' ? 'pending' : 'published';
    repo.insert('posts', { id: uid('po'), kind, userId: user!.id, userName: user!.name, localityId: loc, text: t, photo: photos.length > 0, reactions: {}, status, createdAt: nowIso(), demo: true });
    toast(status === 'pending' ? 'Submitted for moderation' : 'Posted to the community');
    setText(''); setPhotos([]); setErr(''); onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="New community post" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Post</Button></>}>
      <div className="grid gap-4">
        <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value as Post['kind'])} options={KINDS.map((k) => ({ value: k.id, label: k.label }))} />
        <Select label="Locality" value={loc} onChange={(e) => setLoc(e.target.value)} options={LOCALITY_OPTIONS} />
        <TextArea label="What’s on your mind?" value={text} error={err} onChange={(e) => setText(e.target.value)} maxLength={2000} />
        {kind === 'photo' && <FilePicker label="Photo" value={photos} onChange={setPhotos} multiple={false} />}
        <p className="text-xs text-muted">Announcements are reviewed before publishing. Don’t share phone numbers or addresses of other people.</p>
      </div>
    </Dialog>
  );
}

export function PostPage() {
  const { id = '' } = useParams();
  const p = useDB((s) => s.posts.find((x) => x.id === id));
  useDocumentTitle('Community post');
  if (!p || p.status === 'removed') return <NotFound />;
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/community" className="hover:underline">Community</Link> / Post</nav>
      <PostCard p={p} full />
      <CommentsThread targetType="post" targetId={p.id} title={p.text.slice(0, 50)} />
    </div>
  );
}

/* ------------------------------- Polls ------------------------------- */

export function PollsPage() {
  useDocumentTitle('Polls');
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'active' | 'upcoming' | 'archive') ?? 'active';
  const polls = useDB((s) => s.polls.filter((p) => p.status === 'approved'));
  const votes = useDB((s) => s.votes);
  const [topic, setTopic] = useState('');
  const [loc, setLoc] = useState('');
  const [period, setPeriod] = useState('');
  const topics = Array.from(new Set(polls.map((p) => p.category)));
  const list = polls.filter((p) => {
    const ph = pollPhase(p, now);
    if (tab === 'active' && ph !== 'open') return false;
    if (tab === 'upcoming' && ph !== 'scheduled') return false;
    if (tab === 'archive' && ph !== 'closed') return false;
    if (topic && p.category !== topic) return false;
    if (loc && p.localityId !== loc) return false;
    if (period && now - Date.parse(p.closesAt) > Number(period) * 86400_000) return false;
    return true;
  });
  return (
    <div className="grid gap-5">
      <PageHeader title="Community polls" subtitle="One vote per account. Some polls reveal results only after a set time." actions={<LinkButton to="/polls/new" icon={<Plus className="size-4" aria-hidden />}>Suggest a poll</LinkButton>} />
      <Tabs label="Poll status" value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} tabs={[{ id: 'active', label: 'Active' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'archive', label: 'Archive' }]} />
      {tab === 'archive' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select aria-label="Topic" className="input min-h-10 text-sm" value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">All topics</option>{topics.map((t) => <option key={t}>{t}</option>)}</select>
          <select aria-label="Locality" className="input min-h-10 text-sm" value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Citywide & all</option>{LOCALITY_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          <select aria-label="Date" className="input min-h-10 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">Any date</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select>
          <Button variant="ghost" size="sm" onClick={() => { setTopic(''); setLoc(''); setPeriod(''); }}>Reset filters</Button>
        </div>
      )}
      {list.length === 0 ? <EmptyState icon={<Vote className="size-6" aria-hidden />} title="No polls here" text={tab === 'active' ? 'No polls are open right now.' : 'Nothing matches these filters.'} action={<LinkButton variant="secondary" to="/polls/new">Suggest a poll</LinkButton>} /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((p) => {
            const res = pollResults(p, votes, now);
            const voted = !!userVote(p.id, null, votes);
            return (
              <li key={p.id}>
                <Link to={`/polls/${p.id}`} className="card block h-full p-4 hover:border-brand/30">
                  <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{p.category}</Badge>{p.localityId && <Badge>{localityName(p.localityId)}</Badge>}<Badge>{p.origin === 'admin' ? 'Official poll' : 'Community poll'}</Badge>{p.demo && <DemoBadge />}</div>
                  <p className="mt-2 font-bold">{p.question}</p>
                  <p className="mt-1 text-sm text-muted">{participation(p, votes)} votes · {pollPhase(p, now) === 'scheduled' ? `Opens ${formatDateTime(p.opensAt)}` : pollPhase(p, now) === 'open' ? `Closes in ${countdown(p.closesAt, now)}` : `Closed ${formatDate(p.closesAt)}`}</p>
                  {res ? <p className="mt-1 text-sm font-semibold text-teal">Leading: {p.options[res.counts.indexOf(Math.max(...res.counts))].label} ({Math.max(...res.percentages)}%)</p>
                    : <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted"><EyeOff className="size-4" aria-hidden />Results revealed {formatDateTime(p.revealAt)}</p>}
                  {voted && <span className="sr-only">You voted</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PollPage() {
  const { id = '' } = useParams();
  const now = useNow(15_000);
  const { userId } = useSession();
  const p = useDB((s) => s.polls.find((x) => x.id === id));
  const votes = useDB((s) => s.votes);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const { toast } = useUI();
  const guard = useRequireAuth();
  useDocumentTitle(p?.question ?? 'Poll');
  if (!p || (p.status !== 'approved' && p.createdBy !== userId)) return <NotFound />;
  const phase = pollPhase(p, now);
  const mine = userVote(p.id, userId, votes);
  const check = canVote(p, userId, votes, now);
  const res = pollResults(p, votes, now);
  const total = participation(p, votes);

  const vote = () => guard(() => {
    if (!choice) { toast('Choose an option first.', 'error'); return; }
    const c = canVote(p, userId, votes, Date.now());
    if (!c.ok) { toast(c.reason!, 'error'); return; }
    setBusy(true);
    repo.insert('votes', { id: uid('v'), pollId: p.id, optionId: choice, userId: userId!, createdAt: nowIso(), demo: true });
    const pts = awardPoints('poll_vote', `Voted: ${p.question}`);
    setTimeout(() => { setBusy(false); toast(`Vote recorded${pts ? ` · +${pts} points` : ''}`); }, 300);
  });

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/polls" className="hover:underline">Polls</Link> / {p.category}</nav>
      <header>
        <div className="flex flex-wrap gap-1.5"><StatusPill status={phase} /><Badge tone="navy">{p.category}</Badge>{p.localityId && <Badge>{localityName(p.localityId)}</Badge>}<Badge>{p.visibility === 'anonymous' ? 'Anonymous voting' : 'Public voting'}</Badge>{p.demo && <DemoBadge label="Demo poll" />}</div>
        <h1 className="mt-2 text-2xl font-extrabold text-navy">{p.question}</h1>
        {p.description && <p className="mt-1 text-muted">{p.description}</p>}
        <p className="mt-2 text-sm text-muted"><Clock className="mr-1 inline size-4" aria-hidden />Opens {formatDateTime(p.opensAt)} · Closes {formatDateTime(p.closesAt)} · Results {formatDateTime(p.revealAt)}</p>
      </header>

      {phase === 'pending' && <Notice tone="info" title="Awaiting moderation">Community polls are reviewed by moderators before they go live.</Notice>}

      {phase === 'open' && !mine && (
        <fieldset className="card grid gap-2 p-4">
          <legend className="sr-only">Options</legend>
          {p.options.map((o) => (
            <label key={o.id} className={cx('flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3', choice === o.id ? 'border-brand bg-brand-50' : 'border-line')}>
              <input type="radio" name="poll" value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} className="size-5 accent-navy" />{o.label}
            </label>
          ))}
          <Button className="mt-2" loading={busy} disabled={!check.ok && !!userId} onClick={vote}>Submit vote</Button>
          {!check.ok && userId && <p className="text-sm text-muted">{check.reason}</p>}
        </fieldset>
      )}
      {mine && <Notice tone="success" title="Thanks for voting">You chose “{p.options.find((o) => o.id === mine.optionId)?.label}”. Each account can vote once.</Notice>}
      {phase === 'scheduled' && <Notice tone="info" title="Not open yet">Voting opens {formatDateTime(p.opensAt)} (in {countdown(p.opensAt, now)}).</Notice>}

      <section className="card p-4" aria-labelledby="res-h">
        <div className="flex items-center justify-between"><h2 id="res-h" className="font-bold text-navy">Results</h2><span className="text-sm text-muted">{total} participants</span></div>
        {res ? (
          <div className="mt-3 grid gap-4">
            <BarList rows={p.options.map((o, i) => ({ label: o.label, value: res.percentages[i], sub: `${res.counts[i]} votes`, highlight: res.counts[i] === Math.max(...res.counts) }))} />
            {p.previous && (
              <div><h3 className="mb-2 text-sm font-semibold">Compared with {p.previous.label}</h3>
                <BarList rows={p.options.map((o, i) => ({ label: o.label, value: p.previous!.percentages[i] ?? 0 }))} /></div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={<Download className="size-4" aria-hidden />} onClick={() => downloadInfographic(p, res.percentages, res.total)}>Download infographic</Button>
              <ShareButton title={`Poll results: ${p.question}`} />
            </div>
            {p.seedCounts && <p className="text-xs text-muted">Includes seeded demo votes. Production counts come only from server-verified votes.</p>}
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-3 rounded-lg bg-page p-4">
            <Lock className="size-5 text-navy" aria-hidden />
            <div><p className="font-semibold">Results will be revealed at {formatDateTime(p.revealAt)}</p><p className="text-sm text-muted">Time remaining: {countdown(p.revealAt, now)}. Results stay hidden until then — for everyone, including the poll creator.</p></div>
          </div>
        )}
      </section>
      <button type="button" className="justify-self-start text-sm text-brand underline" onClick={() => setInfo(true)}>How voting is protected</button>
      <Dialog open={info} onClose={() => setInfo(false)} title="How voting is protected">
        <ul className="grid list-disc gap-2 pl-5 text-sm"><li>One vote per signed-in account.</li><li>In this demo the rule is checked in the browser only. In production, the server enforces a unique (poll, account) constraint and rate limits.</li><li>Hidden results are not sent to the browser before the reveal time in production.</li><li>Anonymous polls never show who voted for what.</li></ul>
      </Dialog>
      {isRevealed(p, now) && <CommentsThread targetType="poll" targetId={p.id} title={p.question} />}
    </div>
  );
}

/** Builds a simple SVG infographic and downloads it — no external service involved. */
function downloadInfographic(p: Poll, pct: number[], total: number) {
  const rows = p.options.map((o, i) => `<text x="24" y="${130 + i * 56}" font-size="18" fill="#182230">${escapeXml(o.label)} — ${pct[i]}%</text><rect x="24" y="${140 + i * 56}" width="${(pct[i] / 100) * 552}" height="14" rx="7" fill="#0F766E"/>`).join('');
  const h = 170 + p.options.length * 56;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${h}" viewBox="0 0 600 ${h}"><rect width="600" height="${h}" fill="#F5F7FA"/><rect width="600" height="64" fill="#13243A"/><text x="24" y="40" font-size="22" font-weight="700" fill="#fff">One Bhilwara · Poll results</text><text x="24" y="98" font-size="17" font-weight="700" fill="#13243A">${escapeXml(p.question)}</text>${rows}<text x="24" y="${h - 16}" font-size="13" fill="#667085">${total} participants${p.demo ? ' · demo data' : ''}</text></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url; a.download = `one-bhilwara-poll-${p.id}.svg`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

export function NewPollPage() {
  useDocumentTitle('Suggest a poll');
  const nav = useNavigate();
  const user = useCurrentUser();
  const { role } = useSession();
  const { toast } = useUI();
  const today = new Date();
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState({ question: '', description: '', category: 'Community', localityId: '', options: ['', ''], opensAt: toLocal(today), closesAt: toLocal(new Date(today.getTime() + 3 * 86400_000)), revealAt: toLocal(new Date(today.getTime() + 3 * 86400_000)), visibility: 'anonymous' as Poll['visibility'], delayed: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isAdmin = role === 'admin';
  const optionsClean = useMemo(() => f.options.map((o) => sanitize(o, 80)).filter(Boolean), [f.options]);
  const submit = () => {
    const e: Record<string, string> = {};
    if (sanitize(f.question, 200).length < 10) e.question = 'Write a clear question (10+ characters).';
    if (optionsClean.length < 2) e.options = 'Add at least two options.';
    if (new Set(optionsClean.map((o) => o.toLowerCase())).size !== optionsClean.length) e.options = 'Options must be different.';
    if (Date.parse(f.closesAt) <= Date.parse(f.opensAt)) e.closesAt = 'Closing time must be after opening time.';
    const reveal = f.delayed ? f.revealAt : f.opensAt;
    if (f.delayed && Date.parse(reveal) < Date.parse(f.closesAt)) e.revealAt = 'Reveal time should be at or after closing.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const poll: Poll = {
      id: uid('pl'), question: sanitize(f.question, 200), description: sanitize(f.description, 500) || undefined, category: f.category, localityId: f.localityId || undefined,
      options: optionsClean.map((label, i) => ({ id: `o${i + 1}`, label })), opensAt: new Date(f.opensAt).toISOString(), closesAt: new Date(f.closesAt).toISOString(), revealAt: new Date(reveal).toISOString(),
      visibility: f.visibility, origin: isAdmin ? 'admin' : 'community', createdBy: user!.id, status: isAdmin ? 'approved' : 'pending', createdAt: nowIso(), demo: true
    };
    repo.insert('polls', poll);
    if (!isAdmin) notify('u-10', 'poll', 'Poll awaiting moderation', poll.question, '/admin?tab=polls');
    toast(isAdmin ? 'Poll published' : 'Poll submitted for moderation');
    nav(`/polls/${poll.id}`);
  };
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <PageHeader title={isAdmin ? 'Create poll' : 'Suggest a poll'} subtitle={isAdmin ? 'Admin polls publish immediately.' : 'Community polls are reviewed by moderators before going live.'} />
      <form className="card grid gap-4 p-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <TextField label="Question" required value={f.question} error={errors.question} maxLength={200} onChange={(e) => setF({ ...f, question: e.target.value })} />
        <TextArea label="Description (optional)" value={f.description} maxLength={500} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={['Community', 'Civic', 'Transport', 'Agriculture', 'Tourism', 'Education', 'Business']} />
          <Select label="Locality" value={f.localityId} onChange={(e) => setF({ ...f, localityId: e.target.value })} options={LOCALITIES.filter((l) => l.id !== 'all').map((l) => ({ value: l.id, label: l.name }))} placeholder="Citywide" />
        </div>
        <fieldset className="grid gap-2">
          <legend className="label">Options</legend>
          {f.options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Option ${i + 1}`} className="input" value={o} maxLength={80} onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? e.target.value : x)) })} />
              {f.options.length > 2 && <Button variant="ghost" aria-label={`Remove option ${i + 1}`} onClick={() => setF({ ...f, options: f.options.filter((_, j) => j !== i) })}>✕</Button>}
            </div>
          ))}
          {f.options.length < 6 && <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => setF({ ...f, options: [...f.options, ''] })}>Add option</Button>}
          {errors.options && <p className="text-xs font-medium text-danger" role="alert">{errors.options}</p>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Opens" type="datetime-local" value={f.opensAt} onChange={(e) => setF({ ...f, opensAt: e.target.value })} />
          <TextField label="Closes" type="datetime-local" value={f.closesAt} error={errors.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} />
        </div>
        <Checkbox label="Hide results until a reveal time" checked={f.delayed} onChange={(v) => setF({ ...f, delayed: v })} description="Otherwise results show live as people vote." />
        {f.delayed && <TextField label="Reveal results at" type="datetime-local" value={f.revealAt} error={errors.revealAt} onChange={(e) => setF({ ...f, revealAt: e.target.value })} />}
        <Select label="Voting visibility" value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as Poll['visibility'] })} options={[{ value: 'anonymous', label: 'Anonymous — nobody sees individual votes' }, { value: 'public', label: 'Public — voter names may be shown' }]} />
        <FilePicker label="Image (optional)" value={[]} onChange={() => toast('Image noted (demo — not uploaded)', 'info')} multiple={false} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button><Button type="submit" icon={<Share2 className="size-4" aria-hidden />}>{isAdmin ? 'Publish poll' : 'Submit for review'}</Button></div>
      </form>
    </div>
  );
}
