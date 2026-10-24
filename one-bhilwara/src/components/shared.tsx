import { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Flag, MapPin, MessageCircle, Phone, RotateCcw, Send, Share2, ThumbsUp } from 'lucide-react';
import type { Comment, Enquiry, ID, Review } from '@/types/models';
import { LOCALITIES } from '@/config/catalog';
import { useCurrentUser, useDB, useSession } from '@/hooks/useStore';
import { currentUserId, fileReport, isSaved, notify, sanitize, toggleSave } from '@/services/domain/common';
import { repo } from '@/services/store';
import { formatDate, isValidMobile, timeAgo } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';
import { Avatar, Badge, Button, cx, EmptyState, Notice, Rating, StarInput } from './ui/primitives';
import { Dialog, useUI } from './ui/overlay';
import { Checkbox, Select, TextArea, TextField } from './ui/form';

/** Returns a guard: runs `fn` when signed in, otherwise offers a sign-in toast. */
export function useRequireAuth() {
  const { userId } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const { toast } = useUI();
  return (fn: () => void) => {
    if (userId) return fn();
    toast('Please sign in to continue.', 'info', { label: 'Sign in', onClick: () => nav(`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`) });
  };
}

export function SaveButton({ type, id, compact }: { type: string; id: ID; compact?: boolean }) {
  useDB((s) => s.saved.length); // re-render when saved items change
  const saved = isSaved(type, id);
  const guard = useRequireAuth();
  const { toast } = useUI();
  return (
    <Button variant="secondary" size="sm" aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save'} icon={saved ? <BookmarkCheck className="size-4 text-teal" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); guard(() => toast(toggleSave(type, id) ? 'Saved to your profile' : 'Removed from saved')); }}>
      {!compact && (saved ? 'Saved' : 'Save')}
    </Button>
  );
}

export function ShareButton({ title, path, compact }: { title: string; path?: string; compact?: boolean }) {
  const loc = useLocation();
  const { toast } = useUI();
  const url = `${window.location.origin}${path ?? loc.pathname}`;
  return (
    <Button variant="secondary" size="sm" aria-label="Share" icon={<Share2 className="size-4" aria-hidden />} onClick={async (e) => {
      e.preventDefault(); e.stopPropagation();
      try {
        if (navigator.share) { await navigator.share({ title, url }); return; }
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') toast('Could not share. Copy the address bar link instead.', 'error');
      }
    }}>
      {!compact && 'Share'}
    </Button>
  );
}

const REASONS = ['Spam or misleading', 'Suspected fake listing or scam', 'Inappropriate or offensive', 'Wrong information', 'Harassment or abuse', 'Prohibited item or service', 'Other'];

export function ReportButton({ targetType, targetId, title, kind = 'report', label, compact }: { targetType: string; targetId: ID; title: string; kind?: 'report' | 'complaint' | 'dispute'; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const guard = useRequireAuth();
  const { toast } = useUI();
  return (
    <>
      <Button variant="ghost" size="sm" icon={<Flag className="size-4" aria-hidden />} onClick={(e) => { e.preventDefault(); e.stopPropagation(); guard(() => setOpen(true)); }} aria-label={label ?? 'Report'}>
        {!compact && (label ?? 'Report')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={kind === 'complaint' ? 'Raise a complaint' : kind === 'dispute' ? 'Open a dispute' : 'Report content'} description={title}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={busy} onClick={() => {
          setBusy(true);
          fileReport(kind, targetType, targetId, title, reason, details);
          setTimeout(() => { setBusy(false); setOpen(false); setDetails(''); toast('Thanks — our moderators will review this (demo queue).'); }, 300);
        }}>Submit</Button></>}>
        <div className="grid gap-4">
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS} />
          <TextArea label="Details (optional)" value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} hint="Don’t include personal or medical information." />
          <p className="text-xs text-muted">Reports go to the admin moderation queue. False reports may lead to account restrictions. See the <a className="underline" href="/policies/community-guidelines">Community Guidelines</a>.</p>
        </div>
      </Dialog>
    </>
  );
}

/** Enquiry with explicit consent before sharing contact details with a named provider. */
export function EnquiryButton({ targetType, targetId, targetName, ownerId, label = 'Send enquiry', purpose, variant = 'primary', block }: {
  targetType: Enquiry['targetType']; targetId: ID; targetName: string; ownerId?: ID; label?: string; purpose?: string; variant?: 'primary' | 'teal' | 'secondary'; block?: boolean;
}) {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', mobile: '', message: '', preferredTime: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const guard = useRequireAuth();
  const { toast } = useUI();
  const openForm = () => guard(() => { setForm({ name: user?.name ?? '', mobile: user?.mobile ?? '', message: '', preferredTime: '' }); setConsent(false); setErrors({}); setOpen(true); });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (!isValidMobile(form.mobile)) e.mobile = 'Enter a valid 10-digit Indian mobile number.';
    if (form.message.trim().length < 5) e.message = 'Please add a short message (5+ characters).';
    if (!consent) e.consent = 'Consent is needed to share your details.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const q: Enquiry = { id: uid('q'), targetType, targetId, targetName, ownerId, fromUserId: currentUserId()!, name: sanitize(form.name, 80), mobile: form.mobile, message: sanitize(form.message, 1000), preferredTime: form.preferredTime || undefined, consent, status: 'new', replies: [], createdAt: nowIso(), demo: true };
    repo.insert('enquiries', q);
    if (ownerId) notify(ownerId, 'business', 'New enquiry', `${q.name} enquired about ${targetName}`, '/business-dashboard?tab=enquiries');
    setTimeout(() => { setBusy(false); setOpen(false); toast('Enquiry saved. In demo mode it is not delivered to a real provider.'); }, 400);
  };
  return (
    <>
      <Button variant={variant} block={block} icon={<MessageCircle className="size-4" aria-hidden />} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openForm(); }}>{label}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label} description={targetName}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={submit} icon={<Send className="size-4" aria-hidden />}>Send</Button></>}>
        <div className="grid gap-4">
          <TextField label="Your name" required value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
          <TextField label="Mobile number" required inputMode="numeric" value={form.mobile} error={errors.mobile} placeholder="98765 43210" onChange={(e) => setForm({ ...form, mobile: e.target.value })} autoComplete="tel" />
          <TextField label="Preferred time to contact (optional)" value={form.preferredTime} onChange={(e) => setForm({ ...form, preferredTime: e.target.value })} placeholder="e.g. Weekdays after 6 pm" />
          <TextArea label="Message" required value={form.message} error={errors.message} maxLength={1000} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <div className="rounded-lg bg-page p-3 text-sm">
            <p><span className="font-semibold">Shared with:</span> {targetName}</p>
            <p><span className="font-semibold">Purpose:</span> {purpose ?? 'To respond to your enquiry.'}</p>
            <div className="mt-2"><Checkbox checked={consent} onChange={setConsent} label="I agree to share my name and mobile number with this provider for this enquiry." /></div>
            {errors.consent && <p className="mt-1 text-xs font-medium text-danger" role="alert">{errors.consent}</p>}
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Demo listings never show a real phone number. */
export function CallButton({ phone, name }: { phone?: string; name: string }) {
  const { toast } = useUI();
  if (phone) return <a href={`tel:${phone}`} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold"><Phone className="size-4" aria-hidden />Call</a>;
  return <Button variant="secondary" size="sm" icon={<Phone className="size-4" aria-hidden />} onClick={() => toast(`${name}: phone number hidden for demo listings. Use “Send enquiry”.`, 'info')}>Call</Button>;
}

export function DirectionsButton({ query }: { query: string }) {
  return (
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink" aria-label="Directions (opens Google Maps)">
      <MapPin className="size-4" aria-hidden />Directions
    </a>
  );
}

export function ReviewsSection({ targetType, targetId, targetName }: { targetType: Review['targetType']; targetId: ID; targetName: string }) {
  const reviews = useDB((s) => s.reviews.filter((r) => r.targetType === targetType && r.targetId === targetId && !r.hidden));
  const { userId } = useSession();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const guard = useRequireAuth();
  const { toast } = useUI();
  const mine = reviews.find((r) => r.userId === userId);
  return (
    <section aria-labelledby="reviews-h">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="reviews-h" className="text-lg font-bold text-navy">Reviews ({reviews.length})</h2>
        {!mine && <Button size="sm" variant="secondary" onClick={() => guard(() => setOpen(true))}>Write a review</Button>}
      </div>
      {reviews.length === 0 ? <EmptyState title="No reviews yet" text="Be the first to share a fair, first-hand experience." /> : (
        <ul className="grid gap-3">
          {reviews.map((r) => (
            <li key={r.id} className="card p-4">
              <div className="flex items-center gap-3">
                <Avatar name={r.userName} size={32} />
                <div className="flex-1"><p className="text-sm font-semibold">{r.userName}</p><p className="text-xs text-muted">{formatDate(r.createdAt)}</p></div>
                <Rating value={r.rating} />
              </div>
              <p className="mt-2 text-sm">{r.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.verifiedTransaction ? <Badge tone="teal">Verified transaction</Badge> : <Badge>Not linked to a transaction</Badge>}
                <ReportButton targetType="review" targetId={r.id} title={`Review on ${targetName}`} compact />
              </div>
              {r.reply && <div className="mt-3 rounded-lg bg-page p-3 text-sm"><p className="font-semibold text-navy">Response from {targetName}</p><p>{r.reply.text}</p></div>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Write a review" description={targetName}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => {
          if (!rating) return setErr('Choose a star rating.');
          if (text.trim().length < 10) return setErr('Please write at least 10 characters.');
          repo.insert('reviews', { id: uid('r'), targetType, targetId, userId: userId!, userName: user?.name ?? 'User', rating, text: sanitize(text, 1500), verifiedTransaction: false, createdAt: nowIso(), demo: true });
          setOpen(false); setRating(0); setText(''); setErr(''); toast('Review posted');
        }}>Post review</Button></>}>
        <div className="grid gap-4">
          <StarInput value={rating} onChange={setRating} />
          <TextArea label="Your review" value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} />
          {err && <p className="text-sm font-medium text-danger" role="alert">{err}</p>}
          <Notice tone="info">Reviews must be honest and first-hand. Incentivised or fake reviews are removed. Providers can reply publicly.</Notice>
        </div>
      </Dialog>
    </section>
  );
}

export function CommentsThread({ targetType, targetId, title }: { targetType: Comment['targetType']; targetId: ID; title: string }) {
  const all = useDB((s) => s.comments.filter((c) => c.targetType === targetType && c.targetId === targetId && !c.hidden));
  const user = useCurrentUser();
  const blocked = user?.blocked ?? [];
  const comments = all.filter((c) => !blocked.includes(c.userId));
  const roots = comments.filter((c) => !c.parentId);
  const guard = useRequireAuth();
  const { toast } = useUI();

  const post = (text: string, parentId?: ID) => {
    const t = sanitize(text, 1000);
    if (t.length < 2) { toast('Comment is too short.', 'error'); return false; }
    repo.insert('comments', { id: uid('cm'), targetType, targetId, parentId, userId: user!.id, userName: user!.name, text: t, likedBy: [], createdAt: nowIso(), demo: true }, false);
    if (parentId) {
      const parent = all.find((c) => c.id === parentId);
      if (parent && parent.userId !== user!.id) notify(parent.userId, 'comment', 'New reply to your comment', `${user!.name} replied on “${title}”`, window.location.pathname);
    }
    toast('Comment posted');
    return true;
  };

  return (
    <section aria-labelledby="comments-h">
      <h2 id="comments-h" className="mb-3 text-lg font-bold text-navy">Comments ({comments.length})</h2>
      <CommentBox onSubmit={(t) => { let ok = false; guard(() => { ok = post(t); }); return ok; }} />
      <ul className="mt-4 grid gap-3">
        {roots.map((c) => (
          <CommentItem key={c.id} c={c} replies={comments.filter((r) => r.parentId === c.id)} onReply={(t) => { let ok = false; guard(() => { ok = post(t, c.id); }); return ok; }} title={title} />
        ))}
      </ul>
      {roots.length === 0 && <p className="mt-3 text-sm text-muted">No comments yet. Start the conversation respectfully.</p>}
      <p className="mt-3 text-xs text-muted">Be respectful. Comments that break the <a className="underline" href="/policies/community-guidelines">Community Guidelines</a> are removed.</p>
    </section>
  );
}

function CommentBox({ onSubmit, placeholder = 'Add a comment…', autoFocus }: { onSubmit: (t: string) => boolean; placeholder?: string; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (onSubmit(text)) setText(''); }}>
      <label className="sr-only" htmlFor={`cb-${placeholder}`}>{placeholder}</label>
      <input id={`cb-${placeholder}`} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={1000} autoFocus={autoFocus} />
      <Button type="submit" disabled={!text.trim()} aria-label="Post comment"><Send className="size-4" aria-hidden /></Button>
    </form>
  );
}

function CommentItem({ c, replies, onReply, title }: { c: Comment; replies: Comment[]; onReply: (t: string) => boolean; title: string }) {
  const [replying, setReplying] = useState(false);
  return (
    <li className="card p-3">
      <CommentBody c={c} title={title} />
      <div className="mt-1 flex gap-1 pl-10">
        <Button variant="ghost" size="sm" onClick={() => setReplying((v) => !v)}>Reply</Button>
      </div>
      {replies.length > 0 && (
        <ul className="mt-2 grid gap-2 border-l-2 border-line pl-4 ml-4">
          {replies.map((r) => <li key={r.id}><CommentBody c={r} title={title} /></li>)}
        </ul>
      )}
      {replying && <div className="mt-2 pl-10"><CommentBox placeholder={`Reply to ${c.userName}…`} autoFocus onSubmit={(t) => { const ok = onReply(t); if (ok) setReplying(false); return ok; }} /></div>}
    </li>
  );
}

function CommentBody({ c, title }: { c: Comment; title: string }) {
  const { userId } = useSession();
  const guard = useRequireAuth();
  const liked = !!userId && c.likedBy.includes(userId);
  return (
    <div className="flex gap-3">
      <Avatar name={c.userName} size={30} />
      <div className="min-w-0 flex-1">
        <p className="text-sm"><span className="font-semibold">{c.userName}</span> <span className="text-xs text-muted">· {timeAgo(c.createdAt)}</span></p>
        <p className="text-sm text-ink break-words">{c.text}</p>
        <div className="mt-1 flex items-center gap-1">
          <button type="button" aria-pressed={liked} onClick={() => guard(() => repo.at('comments').mutate(c.id, (cur) => ({ likedBy: liked ? cur.likedBy.filter((x) => x !== userId) : [...cur.likedBy, userId!] })))}
            className={cx('inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold', liked ? 'text-teal' : 'text-muted hover:text-ink')}>
            <ThumbsUp className="size-3.5" aria-hidden />{c.likedBy.length || ''} Like
          </button>
          <ReportButton targetType="comment" targetId={c.id} title={`Comment on “${title}”`} compact />
        </div>
      </div>
    </div>
  );
}

/* ---------- Filters ---------- */
export interface FilterDef { key: string; label: string; options: Array<string | { value: string; label: string }> }

export function FilterBar({ q, onQ, placeholder, filters, values, onChange, sorts, sort, onSort, toggles, onReset, count }: {
  q: string; onQ: (v: string) => void; placeholder: string; filters?: FilterDef[]; values: Record<string, string>; onChange: (k: string, v: string) => void;
  sorts?: { value: string; label: string }[]; sort?: string; onSort?: (v: string) => void; toggles?: { key: string; label: string; on: boolean; set: (v: boolean) => void }[]; onReset: () => void; count: number;
}) {
  const active = !!q || Object.values(values).some(Boolean) || toggles?.some((t) => t.on);
  return (
    <div className="card grid gap-3 p-3" role="search">
      <label className="sr-only" htmlFor="fb-q">{placeholder}</label>
      <input id="fb-q" className="input" type="search" value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {filters?.map((f) => (
          <div key={f.key}>
            <label className="sr-only" htmlFor={`f-${f.key}`}>{f.label}</label>
            <select id={`f-${f.key}`} className="input min-h-10 text-sm" value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}>
              <option value="">{f.label}: All</option>
              {f.options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
        {sorts && onSort && (
          <div>
            <label className="sr-only" htmlFor="f-sort">Sort</label>
            <select id="f-sort" className="input min-h-10 text-sm" value={sort} onChange={(e) => onSort(e.target.value)}>
              {sorts.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {toggles?.map((t) => <button key={t.key} type="button" className="chip" aria-pressed={t.on} onClick={() => t.set(!t.on)}>{t.label}</button>)}
        <span className="ml-auto text-sm text-muted" aria-live="polite">{count} result{count === 1 ? '' : 's'}</span>
        {active && <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" aria-hidden />} onClick={onReset}>Reset</Button>}
      </div>
    </div>
  );
}

export const LOCALITY_OPTIONS = LOCALITIES.filter((l) => l.id !== 'all').map((l) => ({ value: l.id, label: l.name }));

/** Client-side "load more" pagination. Server adapters would page with range queries. */
export function usePaged<T>(items: T[], pageSize = 10) {
  const [n, setN] = useState(pageSize);
  const visible = useMemo(() => items.slice(0, n), [items, n]);
  return { visible, hasMore: items.length > n, more: () => setN((x) => x + pageSize), reset: () => setN(pageSize) };
}

export function LoadMore({ hasMore, onMore }: { hasMore: boolean; onMore: () => void }) {
  if (!hasMore) return null;
  return <div className="mt-4 flex justify-center"><Button variant="secondary" onClick={onMore}>Load more</Button></div>;
}

/* ---------- Charts (dependency-free SVG/CSS) ---------- */
export function BarList({ rows, unit = '%' }: { rows: { label: string; value: number; highlight?: boolean; sub?: string }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm"><span className={cx('font-medium', r.highlight && 'text-teal')}>{r.label}</span><span className="tabular-nums text-muted">{r.value}{unit}{r.sub ? ` · ${r.sub}` : ''}</span></div>
          <div className="h-2.5 rounded-full bg-page" role="presentation"><div className={cx('h-full rounded-full', r.highlight ? 'bg-teal' : 'bg-navy')} style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Sparkline({ values, width = 240, height = 56, label }: { values: number[]; width?: number; height?: number; label: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 4 - ((v - min) / (max - min || 1)) * (height - 8)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxWidth: width }} role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke="var(--color-teal)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function SectionCard({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-bold text-navy">{title}</h2>{actions}</div>
      {children}
    </section>
  );
}
