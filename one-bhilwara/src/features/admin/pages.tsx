import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Plus, ShieldAlert } from 'lucide-react';
import type { Article, CivicAlert, ModerationCase, Role, Verification } from '@/types/models';
import { LOCALITIES, localityName, NEWS_CATEGORIES, ROLES, serviceName } from '@/config/catalog';
import { useDB, useDocumentTitle, useNow } from '@/hooks/useStore';
import { audit, notify, sanitize } from '@/services/domain/common';
import { pollPhase, pollResults } from '@/services/domain/polls';
import { integrations } from '@/services/integrations';
import { repo, store } from '@/services/store';
import { BarList } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, LinkButton, Notice, PageHeader, Stat, StatusPill } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { Select, TextArea, TextField, Toggle } from '@/components/ui/form';
import { formatDateTime, formatINR, formatNum, timeAgo } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';

type Tab = 'dashboard' | 'users' | 'businesses' | 'news' | 'polls' | 'marketplace' | 'listings' | 'services' | 'ads' | 'reports' | 'finance' | 'settings' | 'audit';

export function AdminPage() {
  useDocumentTitle('Admin');
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'dashboard';
  const db = useDB((s) => s);
  const openCases = db.cases.filter((c) => c.status === 'open' || c.status === 'reviewing').length;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'dashboard', label: 'Dashboard' }, { id: 'reports', label: 'Reports & complaints', count: openCases }, { id: 'users', label: 'Users' },
    { id: 'businesses', label: 'Businesses', count: db.verificationRequests.filter((v) => ['submitted', 'under_review'].includes(v.status)).length },
    { id: 'news', label: 'News & alerts' }, { id: 'polls', label: 'Polls', count: db.polls.filter((p) => p.status === 'pending').length },
    { id: 'marketplace', label: 'Marketplace' }, { id: 'listings', label: 'Jobs & property', count: db.jobs.filter((j) => j.status === 'pending_review').length + db.properties.filter((p) => p.status === 'pending_review').length },
    { id: 'services', label: 'Services' }, { id: 'ads', label: 'Advertising', count: db.campaigns.filter((c) => c.status === 'pending_review').length },
    { id: 'finance', label: 'Finance' }, { id: 'settings', label: 'Settings' }, { id: 'audit', label: 'Audit log' }
  ];
  return (
    <div className="grid gap-5">
      <PageHeader title="Admin panel" subtitle="Moderation, verification, content and platform settings." badge={<DemoBadge label="Demo admin" />} />
      <Notice tone="warning" title="Security note"><ShieldAlert className="mr-1 inline size-4" aria-hidden />In this demo, admin access is a client-side role switch. Production must enforce every admin action with server-side authorisation (e.g. Supabase RLS + admin role claims) and record it in the audit log.</Notice>
      <Tabs label="Admin sections" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={tabs} />
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'users' && <Users />}
      {tab === 'businesses' && <Businesses />}
      {tab === 'news' && <News />}
      {tab === 'polls' && <Polls />}
      {tab === 'marketplace' && <Marketplace />}
      {tab === 'listings' && <Listings />}
      {tab === 'services' && <Services />}
      {tab === 'ads' && <Ads />}
      {tab === 'reports' && <Reports />}
      {tab === 'finance' && <Finance />}
      {tab === 'settings' && <PlatformSettings />}
      {tab === 'audit' && <AuditLog />}
    </div>
  );
}

function Dashboard() {
  const db = useDB((s) => s);
  const weekAgo = Date.now() - 7 * 86400_000;
  return (
    <>
      <p className="text-sm text-muted">All values below come from the demo database and are labelled demo data. Revenue shows recorded demo transactions only — there are no actual transactions.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total users" value={db.users.length} hint="Demo" /><Stat label="Active users" value={db.users.filter((u) => u.status === 'active').length} hint="Not suspended" />
        <Stat label="New registrations (7d)" value={db.users.filter((u) => Date.parse(u.createdAt) > weekAgo).length} /><Stat label="Business listings" value={db.businesses.length} />
        <Stat label="Verified businesses" value={db.businesses.filter((b) => b.verification === 'verified').length} /><Stat label="Published articles" value={db.articles.filter((a) => a.status === 'published').length} />
        <Stat label="Active jobs" value={db.jobs.filter((j) => j.status === 'open').length} /><Stat label="Property listings" value={db.properties.filter((p) => p.status === 'active').length} />
        <Stat label="Marketplace listings" value={db.classifieds.filter((c) => c.status === 'active').length} /><Stat label="Service requests" value={db.serviceRequests.length} />
        <Stat label="Leads (enquiries)" value={db.enquiries.length} /><Stat label="Bookings" value={db.bookings.length} />
        <Stat label="Open complaints/reports" value={db.cases.filter((c) => c.status === 'open').length} />
        <Stat label="Demo revenue" value={formatINR(db.payments.filter((p) => p.status === 'demo_success').reduce((a, p) => a + p.amount, 0))} hint="Simulated — no real money" />
        <Stat label="Actual revenue" value="₹0" hint="No payment gateway connected" />
      </div>
    </>
  );
}

function Users() {
  const users = useDB((s) => s.users);
  const [q, setQ] = useState('');
  const [view, setView] = useState<string | null>(null);
  const { toast, confirm } = useUI();
  const list = users.filter((u) => `${u.name} ${u.mobile ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const u = users.find((x) => x.id === view);
  return (
    <div className="grid gap-3">
      <input aria-label="Search users" type="search" className="input sm:w-80" placeholder="Search name, mobile or email" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3">User</th><th className="p-3">Locality</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x.id} className="border-b border-line last:border-0">
              <td className="p-3"><button type="button" className="font-semibold text-navy underline-offset-2 hover:underline" onClick={() => setView(x.id)}>{x.name}</button>{x.demo && <span className="ml-1 text-xs text-muted">(demo)</span>}</td>
              <td className="p-3">{localityName(x.localityId)}</td>
              <td className="p-3">
                <label className="sr-only" htmlFor={`role-${x.id}`}>Role for {x.name}</label>
                <select id={`role-${x.id}`} className="input min-h-9 w-auto text-sm" value={x.role} onChange={async (e) => {
                  const role = e.target.value as Role;
                  if (await confirm({ title: 'Change role?', message: `Set ${x.name} to ${role}. In production this requires a server-side admin check.` })) { repo.patch('users', x.id, { role }); audit('change_role', x.id, role); toast('Role updated (audited)'); }
                }}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
              </td>
              <td className="p-3"><StatusPill status={x.status} /></td>
              <td className="p-3">{x.status === 'active'
                ? <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: 'Suspend user?', message: `${x.name} won’t be able to post or transact.`, danger: true, confirmLabel: 'Suspend' })) { repo.patch('users', x.id, { status: 'suspended' }); audit('suspend_user', x.id); toast('User suspended'); } }}>Suspend</Button>
                : <Button size="sm" variant="ghost" onClick={() => { repo.patch('users', x.id, { status: 'active' }); audit('reactivate_user', x.id); toast('User reactivated'); }}>Reactivate</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Dialog open={!!u} onClose={() => setView(null)} title={u?.name ?? ''} description="User profile (admin view)">
        {u && <div className="grid gap-1 text-sm"><p>ID: {u.id}</p><p>Mobile: {u.mobile ?? '—'} · Email: {u.email ?? '—'}</p><p>Joined: {formatDateTime(u.createdAt)}</p><p>Interests: {u.interests.join(', ') || '—'}</p><p>Reports filed against: {store.getState().cases.filter((c) => c.targetId === u.id).length}</p></div>}
      </Dialog>
    </div>
  );
}

function Businesses() {
  const reqs = useDB((s) => s.verificationRequests);
  const businesses = useDB((s) => s.businesses);
  const [note, setNote] = useState<Record<string, string>>({});
  const { toast } = useUI();
  const decide = (id: string, businessId: string, status: Verification) => {
    repo.at('verificationRequests').mutate(id, () => ({ status, note: note[id] }));
    repo.patch('businesses', businessId, status === 'verified' ? { verification: 'verified', claimed: true } : { verification: status });
    const b = businesses.find((x) => x.id === businessId);
    if (b?.ownerId) notify(b.ownerId, 'business', `Verification ${status.replace('_', ' ')}`, b.name, '/business-dashboard?tab=verification');
    audit(`verification_${status}`, businessId, note[id]);
    toast(`Marked ${status.replace('_', ' ')}`);
  };
  return (
    <div className="grid gap-5">
      <section className="grid gap-3">
        <h2 className="font-bold text-navy">Verification & claim requests</h2>
        {reqs.length === 0 ? <EmptyState title="No requests" /> : reqs.map((r) => (
          <article key={r.id} className="card grid gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/businesses/${r.businessId}`} className="font-semibold">{r.businessName}</Link><StatusPill status={r.status} /></div>
            <p className="text-sm text-muted">{r.note ?? 'Verification'} · Documents: {r.documents.join(', ')} · {timeAgo(r.createdAt)}</p>
            {['submitted', 'under_review'].includes(r.status) && (
              <>
                <TextField label="Reviewer note" value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  {r.status === 'submitted' && <Button size="sm" variant="secondary" onClick={() => decide(r.id, r.businessId, 'under_review')}>Start review</Button>}
                  <Button size="sm" variant="teal" onClick={() => decide(r.id, r.businessId, 'verified')}>Approve</Button>
                  <Button size="sm" variant="danger" onClick={() => decide(r.id, r.businessId, 'rejected')}>Reject</Button>
                </div>
              </>
            )}
          </article>
        ))}
      </section>
      <section className="grid gap-2">
        <h2 className="font-bold text-navy">Listings, featured & suspension</h2>
        <ul className="card divide-y divide-line">{businesses.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="min-w-0 flex-1"><Link to={`/businesses/${b.id}`} className="font-semibold">{b.name}</Link> <span className="text-muted">· {b.category}</span></span>
            <StatusPill status={b.verification} />
            <Toggle label="Featured" checked={!!b.sponsored} onChange={(v) => { repo.patch('businesses', b.id, { sponsored: v }); audit('featured_toggle', b.id, String(v)); toast(v ? 'Marked featured (shown as Sponsored)' : 'Removed featured'); }} />
            {b.verification === 'suspended' ? <Button size="sm" variant="ghost" onClick={() => { repo.patch('businesses', b.id, { verification: 'unverified' }); audit('unsuspend_business', b.id); toast('Listing restored (unverified)'); }}>Restore</Button>
              : <Button size="sm" variant="ghost" onClick={() => { repo.patch('businesses', b.id, { verification: 'suspended' }); audit('suspend_business', b.id); toast('Listing suspended'); }}>Suspend</Button>}
          </li>
        ))}</ul>
      </section>
    </div>
  );
}

const emptyArticle = (): Article => ({ id: '', title: '', summary: '', body: [''], category: 'bhilwara', source: 'One Bhilwara Desk', publishedAt: nowIso(), status: 'draft', likedBy: [], tags: [], createdAt: nowIso(), demo: true });

function News() {
  const articles = useDB((s) => s.articles);
  const alerts = useDB((s) => s.alerts);
  const reported = useDB((s) => s.cases.filter((c) => c.targetType === 'article' || c.targetType === 'comment'));
  const [edit, setEdit] = useState<Article | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const { toast } = useUI();
  const setStatus = (a: Article, status: Article['status']) => { repo.patch('articles', a.id, { status, publishedAt: status === 'published' ? nowIso() : a.publishedAt }); audit(`article_${status}`, a.id); toast(`Article ${status}`); };
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2"><Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEdit(emptyArticle())}>New article</Button><Button variant="secondary" onClick={() => setAlertOpen(true)}>New civic alert</Button></div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
          <tbody>{articles.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-0">
              <td className="p-3"><span className="font-semibold">{a.title}</span><span className="block text-xs text-muted">{a.source} · {a.status === 'scheduled' && a.scheduledAt ? `scheduled ${formatDateTime(a.scheduledAt)}` : formatDateTime(a.publishedAt)}</span></td>
              <td className="p-3">{NEWS_CATEGORIES.find((c) => c.id === a.category)?.name}</td>
              <td className="p-3"><StatusPill status={a.status} /></td>
              <td className="p-3"><div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => setEdit(a)}>Edit</Button>
                {a.status !== 'published' && <Button size="sm" variant="teal" onClick={() => setStatus(a, 'published')}>Publish</Button>}
                {a.status === 'published' && <Button size="sm" variant="ghost" onClick={() => setStatus(a, 'unpublished')}>Unpublish</Button>}
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <section className="grid gap-2"><h2 className="font-bold text-navy">Civic alerts</h2>
        <ul className="card divide-y divide-line">{alerts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><span className="flex-1"><b>{a.title}</b> <span className="text-muted">· {a.severity} · {a.localityId ? localityName(a.localityId) : 'Citywide'}</span></span><StatusPill status={a.status} />
            {a.status !== 'resolved' && <Button size="sm" variant="ghost" onClick={() => { repo.patch('alerts', a.id, { status: 'resolved' }); audit('alert_resolved', a.id); toast('Alert resolved'); }}>Resolve</Button>}</li>
        ))}</ul>
      </section>
      <section><h2 className="mb-2 font-bold text-navy">Reported news content</h2>{reported.length ? <p className="text-sm">{reported.length} report(s) — handle them in <Link className="underline" to="/admin?tab=reports">Reports</Link>.</p> : <p className="text-sm text-muted">No reports.</p>}</section>
      <ArticleEditor article={edit} onClose={() => setEdit(null)} />
      <AlertEditor open={alertOpen} onClose={() => setAlertOpen(false)} />
    </div>
  );
}

function ArticleEditor({ article, onClose }: { article: Article | null; onClose: () => void }) {
  const { toast } = useUI();
  const [a, setA] = useState<Article | null>(article);
  const [key, setKey] = useState<string | null>(null);
  if (article && key !== (article.id || 'new')) { setKey(article.id || 'new'); setA(article); }
  if (!article && key !== null) setKey(null);
  const save = (status: Article['status']) => {
    if (!a) return;
    if (sanitize(a.title).length < 8 || sanitize(a.summary).length < 10) { toast('Title and summary are required.', 'error'); return; }
    if (!a.source.trim()) { toast('A source is required.', 'error'); return; }
    if (status === 'scheduled' && (!a.scheduledAt || Date.parse(a.scheduledAt) <= Date.now())) { toast('Choose a future schedule time.', 'error'); return; }
    const data: Article = { ...a, title: sanitize(a.title, 200), summary: sanitize(a.summary, 400), body: a.body.map((p) => sanitize(p, 4000)).filter(Boolean), status, publishedAt: status === 'scheduled' ? a.scheduledAt! : status === 'published' ? nowIso() : a.publishedAt };
    if (a.id) repo.patch('articles', a.id, data); else repo.insert('articles', { ...data, id: uid('n'), createdAt: nowIso() });
    audit(`article_${status}`, a.id || 'new', a.title); toast(`Saved as ${status}`); onClose();
  };
  return (
    <Dialog open={!!article} onClose={onClose} size="lg" title={a?.id ? 'Edit article' : 'New article'}
      footer={<><Button variant="secondary" onClick={() => save('draft')}>Save draft</Button><Button variant="secondary" onClick={() => save('scheduled')}>Schedule</Button><Button onClick={() => save('published')}>Publish</Button></>}>
      {a && (
        <div className="grid gap-3">
          <TextField label="Headline" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} />
          <TextField label="Headline (Hindi, optional)" value={a.titleHi ?? ''} onChange={(e) => setA({ ...a, titleHi: e.target.value || undefined })} />
          <TextArea label="Summary" value={a.summary} onChange={(e) => setA({ ...a, summary: e.target.value })} />
          <TextArea label="Body (blank line between paragraphs)" rows={8} value={a.body.join('\n\n')} onChange={(e) => setA({ ...a, body: e.target.value.split(/\n\s*\n/) })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Category" value={a.category} onChange={(e) => setA({ ...a, category: e.target.value })} options={NEWS_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))} />
            <Select label="Locality" value={a.localityId ?? ''} placeholder="Citywide" onChange={(e) => setA({ ...a, localityId: e.target.value || undefined })} options={LOCALITIES.filter((l) => l.id !== 'all').map((l) => ({ value: l.id, label: l.name }))} />
            <TextField label="Source / publisher" value={a.source} onChange={(e) => setA({ ...a, source: e.target.value })} />
            <TextField label="Original source link" type="url" value={a.sourceUrl ?? ''} onChange={(e) => setA({ ...a, sourceUrl: e.target.value || undefined })} />
            <TextField label="Schedule for" type="datetime-local" value={a.scheduledAt ? a.scheduledAt.slice(0, 16) : ''} onChange={(e) => setA({ ...a, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
          </div>
          <Toggle label="Mark as city alert (breaking)" checked={!!a.breaking} onChange={(v) => setA({ ...a, breaking: v })} />
          <Toggle label="Demo / sample content label" checked={!!a.demo} onChange={(v) => setA({ ...a, demo: v })} description="Keep ON for anything not verified real reporting." />
        </div>
      )}
    </Dialog>
  );
}

function AlertEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useUI();
  const [f, setF] = useState({ title: '', description: '', type: 'notice' as CivicAlert['type'], severity: 'info' as CivicAlert['severity'], localityId: '', hours: '6', source: 'One Bhilwara (demo)' });
  return (
    <Dialog open={open} onClose={onClose} title="New civic alert" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => {
      if (sanitize(f.title).length < 5 || !f.source.trim()) { toast('Title and source are required.', 'error'); return; }
      const a: CivicAlert = { id: uid('al'), title: sanitize(f.title, 120), description: sanitize(f.description, 500), type: f.type, severity: f.severity, localityId: f.localityId || undefined, startsAt: nowIso(), expiresAt: new Date(Date.now() + Number(f.hours) * 3600_000).toISOString(), source: sanitize(f.source, 80), status: 'active', createdAt: nowIso(), demo: true };
      repo.insert('alerts', a); notify('all', 'alert', a.title, a.localityId ? localityName(a.localityId) : 'Citywide', '/alerts'); audit('alert_created', a.id, a.title); toast('Alert published'); onClose();
    }}>Publish alert</Button></>}>
      <div className="grid gap-3">
        <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <TextArea label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CivicAlert['type'] })} options={['road', 'water', 'electricity', 'notice', 'traffic', 'weather', 'municipal', 'emergency']} />
          <Select label="Severity" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as CivicAlert['severity'] })} options={['info', 'advisory', 'warning', 'critical']} />
          <Select label="Locality" value={f.localityId} placeholder="Citywide" onChange={(e) => setF({ ...f, localityId: e.target.value })} options={LOCALITIES.filter((l) => l.id !== 'all').map((l) => ({ value: l.id, label: l.name }))} />
          <Select label="Expires after" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} options={[{ value: '3', label: '3 hours' }, { value: '6', label: '6 hours' }, { value: '24', label: '24 hours' }, { value: '72', label: '3 days' }]} />
        </div>
        <TextField label="Source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} />
      </div>
    </Dialog>
  );
}

function Polls() {
  const now = useNow();
  const polls = useDB((s) => s.polls);
  const votes = useDB((s) => s.votes);
  const { toast } = useUI();
  return (
    <div className="grid gap-3">
      <LinkButton to="/polls/new" className="justify-self-start" icon={<Plus className="size-4" aria-hidden />}>Create poll</LinkButton>
      <ul className="grid gap-3">{polls.map((p) => {
        const res = pollResults(p, votes, now);
        return (
          <li key={p.id} className="card grid gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/polls/${p.id}`} className="font-semibold">{p.question}</Link><div className="flex gap-1.5"><Badge>{p.origin}</Badge><StatusPill status={pollPhase(p, now)} /></div></div>
            <p className="text-xs text-muted">Opens {formatDateTime(p.opensAt)} · closes {formatDateTime(p.closesAt)} · reveal {formatDateTime(p.revealAt)}</p>
            {p.status === 'pending' && <div className="flex gap-2"><Button size="sm" variant="teal" onClick={() => { repo.patch('polls', p.id, { status: 'approved' }); audit('poll_approved', p.id); notify(p.createdBy, 'poll', 'Your poll was approved', p.question, `/polls/${p.id}`); toast('Poll approved'); }}>Approve</Button><Button size="sm" variant="danger" onClick={() => { repo.patch('polls', p.id, { status: 'rejected' }); audit('poll_rejected', p.id); toast('Poll rejected'); }}>Reject</Button></div>}
            {res ? <BarList rows={p.options.map((o, i) => ({ label: o.label, value: res.percentages[i] }))} /> : p.status === 'approved' && <p className="text-sm text-muted">Results hidden until reveal (admins see them at reveal time too).</p>}
            {pollPhase(p, now) === 'open' && <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => { repo.patch('polls', p.id, { closesAt: nowIso() }); audit('poll_closed_early', p.id); toast('Poll closed'); }}>Close now</Button>}
          </li>
        );
      })}</ul>
    </div>
  );
}

function Marketplace() {
  const items = useDB((s) => s.classifieds);
  const { toast } = useUI();
  return (
    <ul className="card divide-y divide-line">{items.map((c) => (
      <li key={c.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="min-w-0 flex-1"><Link to={`/marketplace/${c.id}`} className="font-semibold">{c.title}</Link> <span className="text-muted">· {c.category} · {formatINR(c.price)} · {c.sellerName}</span></span>
        <StatusPill status={c.status} />
        {c.status !== 'flagged' && c.status !== 'removed' && <Button size="sm" variant="ghost" onClick={() => { repo.patch('classifieds', c.id, { status: 'flagged' }); audit('listing_flagged', c.id); toast('Flagged as suspicious'); }}>Flag</Button>}
        {c.status === 'flagged' && <Button size="sm" variant="ghost" onClick={() => { repo.patch('classifieds', c.id, { status: 'active' }); audit('listing_cleared', c.id); toast('Cleared'); }}>Clear flag</Button>}
        {c.status !== 'removed' && <Button size="sm" variant="danger" onClick={() => { repo.patch('classifieds', c.id, { status: 'removed' }); audit('listing_removed', c.id); notify(c.sellerId, 'account', 'Listing removed', `${c.title} was removed for breaking the rules.`, '/policies/community-guidelines'); toast('Listing removed'); }}>Remove</Button>}
      </li>
    ))}</ul>
  );
}

function Listings() {
  const jobs = useDB((s) => s.jobs);
  const props = useDB((s) => s.properties);
  const { toast } = useUI();
  const pendingJobs = jobs.filter((j) => j.status === 'pending_review');
  const pendingProps = props.filter((p) => p.status === 'pending_review');
  return (
    <div className="grid gap-5">
      <section><h2 className="mb-2 font-bold text-navy">Jobs awaiting review ({pendingJobs.length})</h2>
        {pendingJobs.length === 0 ? <p className="text-sm text-muted">Nothing pending.</p> : <ul className="card divide-y divide-line">{pendingJobs.map((j) => (
          <li key={j.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><span className="flex-1"><b>{j.title}</b> · {j.employerName}</span>
            <Button size="sm" variant="teal" onClick={() => { repo.patch('jobs', j.id, { status: 'open' }); audit('job_approved', j.id); if (j.postedBy) notify(j.postedBy, 'job', 'Job approved', j.title, `/jobs/${j.id}`); toast('Job approved'); }}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => { repo.patch('jobs', j.id, { status: 'removed' }); audit('job_rejected', j.id); toast('Job rejected'); }}>Reject</Button>
            <Button size="sm" variant="ghost" onClick={() => { repo.patch('jobs', j.id, { verifiedEmployer: true }); audit('employer_verified', j.id); toast('Employer marked verified'); }}>Verify employer</Button></li>
        ))}</ul>}
      </section>
      <section><h2 className="mb-2 font-bold text-navy">Property awaiting review ({pendingProps.length})</h2>
        {pendingProps.length === 0 ? <p className="text-sm text-muted">Nothing pending.</p> : <ul className="card divide-y divide-line">{pendingProps.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><span className="flex-1"><b>{p.title}</b> · {p.ownerName}</span>
            <Button size="sm" variant="teal" onClick={() => { repo.patch('properties', p.id, { status: 'active' }); audit('property_approved', p.id); toast('Listing approved'); }}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => { repo.patch('properties', p.id, { status: 'removed' }); audit('property_rejected', p.id); toast('Listing rejected'); }}>Reject</Button></li>
        ))}</ul>}
      </section>
      <section><h2 className="mb-2 font-bold text-navy">All jobs</h2><ul className="card divide-y divide-line text-sm">{jobs.map((j) => <li key={j.id} className="flex items-center justify-between gap-2 p-3"><Link to={`/jobs/${j.id}`}>{j.title}</Link><StatusPill status={j.status} /></li>)}</ul></section>
    </div>
  );
}

function Services() {
  const providers = useDB((s) => s.providers);
  const requests = useDB((s) => s.serviceRequests);
  const concierge = useDB((s) => s.concierge);
  const { toast } = useUI();
  const unresolved = requests.filter((r) => !['completed', 'cancelled'].includes(r.status));
  return (
    <div className="grid gap-5">
      <section><h2 className="mb-2 font-bold text-navy">Concierge requests</h2>
        {concierge.length === 0 ? <p className="text-sm text-muted">None.</p> : <ul className="card divide-y divide-line">{concierge.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><span className="flex-1"><b>{c.serviceType}</b> · {localityName(c.localityId)} · coordinator: {c.coordinator ?? 'unassigned'}</span><StatusPill status={c.status} />
            <Button size="sm" variant="secondary" onClick={() => { repo.at('concierge').mutate(c.id, (cur) => ({ coordinator: 'Admin Desk (demo)', status: 'coordinator_assigned', history: [...cur.history, { status: 'coordinator_assigned', at: nowIso(), note: 'Assigned by admin' }] })); audit('coordinator_assigned', c.id); toast('Coordinator assigned'); }}>Assign me</Button>
            <Button size="sm" variant="ghost" onClick={() => { repo.at('concierge').mutate(c.id, (cur) => ({ status: 'closed', history: [...cur.history, { status: 'closed', at: nowIso() }] })); toast('Closed'); }}>Close</Button></li>
        ))}</ul>}
      </section>
      <section><h2 className="mb-2 font-bold text-navy">Unresolved service requests ({unresolved.length})</h2>
        <ul className="card divide-y divide-line text-sm">{unresolved.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 p-3"><Link to={`/service-requests/${r.id}`}>{serviceName(r.category)} · {r.description.slice(0, 50)}</Link><StatusPill status={r.status} /></li>)}</ul>
      </section>
      <section><h2 className="mb-2 font-bold text-navy">Providers</h2>
        <ul className="card divide-y divide-line">{providers.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><span className="flex-1"><Link to={`/service-providers/${p.id}`} className="font-semibold">{p.name}</Link> · {serviceName(p.category)}</span><StatusPill status={p.verification} />
            {p.verification !== 'verified' && <Button size="sm" variant="teal" onClick={() => { repo.patch('providers', p.id, { verification: 'verified' }); audit('provider_verified', p.id); toast('Provider verified'); }}>Verify</Button>}
            {p.verification !== 'suspended' ? <Button size="sm" variant="ghost" onClick={() => { repo.patch('providers', p.id, { verification: 'suspended' }); audit('provider_suspended', p.id); toast('Provider suspended'); }}>Suspend</Button>
              : <Button size="sm" variant="ghost" onClick={() => { repo.patch('providers', p.id, { verification: 'unverified' }); toast('Provider restored'); }}>Restore</Button>}</li>
        ))}</ul>
      </section>
    </div>
  );
}

function Ads() {
  const campaigns = useDB((s) => s.campaigns);
  const { toast } = useUI();
  const set = (id: string, status: 'approved' | 'live' | 'rejected' | 'ended', businessName: string) => { repo.patch('campaigns', id, { status }); audit(`campaign_${status}`, id, businessName); toast(`Campaign ${status}`); };
  return (
    <ul className="grid gap-3">{campaigns.map((c) => (
      <li key={c.id} className="card grid gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{c.headline}</p><StatusPill status={c.status} /></div>
        <p className="text-sm text-muted">{c.businessName} · {c.placement.replace('_', ' ')} · {c.localityId === 'all' ? 'All Bhilwara' : localityName(c.localityId)} · {formatINR(c.budget)} · creative: {c.creativeName ?? 'text only'}</p>
        <p className="text-sm">Impressions {formatNum(c.impressions)} · Clicks {formatNum(c.clicks)} <DemoBadge label="Simulated" /></p>
        <div className="flex flex-wrap gap-2">
          {c.status === 'pending_review' && <><Button size="sm" variant="teal" onClick={() => set(c.id, 'approved', c.businessName)}>Approve creative</Button><Button size="sm" variant="danger" onClick={() => set(c.id, 'rejected', c.businessName)}>Reject</Button></>}
          {c.status === 'approved' && <Button size="sm" onClick={() => set(c.id, 'live', c.businessName)}>Go live</Button>}
          {c.status === 'live' && <Button size="sm" variant="ghost" onClick={() => set(c.id, 'ended', c.businessName)}>End campaign</Button>}
        </div>
      </li>
    ))}</ul>
  );
}

const HIDE_TARGET: Record<string, (id: string) => void> = {
  comment: (id) => repo.patch('comments', id, { hidden: true }),
  review: (id) => repo.patch('reviews', id, { hidden: true }),
  post: (id) => repo.patch('posts', id, { status: 'removed' }),
  classified: (id) => repo.patch('classifieds', id, { status: 'removed' }),
  article: (id) => repo.patch('articles', id, { status: 'unpublished' }),
  job: (id) => repo.patch('jobs', id, { status: 'removed' }),
  property: (id) => repo.patch('properties', id, { status: 'removed' })
};

function Reports() {
  const cases = useDB((s) => s.cases);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [res, setRes] = useState<Record<string, string>>({});
  const { toast } = useUI();
  const list = useMemo(() => cases.filter((c) => filter === 'all' || c.status === 'open' || c.status === 'reviewing'), [cases, filter]);
  const resolve = (c: ModerationCase, status: ModerationCase['status'], removeContent = false) => {
    if (removeContent) HIDE_TARGET[c.targetType]?.(c.targetId);
    repo.patch('cases', c.id, { status, resolution: res[c.id] || (removeContent ? 'Content removed' : undefined) });
    audit(`case_${status}`, c.id, `${c.targetType}:${c.targetId}${removeContent ? ' (content removed)' : ''}`);
    if (c.reporterId && c.reporterId !== 'anonymous') notify(c.reporterId, 'account', 'Update on your report', `${c.targetTitle}: ${status}`, '/help');
    toast(`Case ${status}`);
  };
  return (
    <div className="grid gap-3">
      <Tabs label="Queue" value={filter} onChange={setFilter} tabs={[{ id: 'open', label: 'Open queue' }, { id: 'all', label: 'All cases' }]} />
      {list.length === 0 ? <EmptyState title="Queue is clear" /> : list.map((c) => (
        <article key={c.id} className="card grid gap-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold"><Badge tone={c.kind === 'report' ? 'red' : c.kind === 'complaint' ? 'amber' : 'blue'} className="mr-2 capitalize">{c.kind}</Badge>{c.targetTitle}</p><StatusPill status={c.status} /></div>
          <p className="text-sm"><b>{c.reason}</b>{c.details ? ` — ${c.details}` : ''}</p>
          <p className="text-xs text-muted">{c.targetType} · {timeAgo(c.createdAt)}{c.resolution ? ` · Resolution: ${c.resolution}` : ''}</p>
          {(c.status === 'open' || c.status === 'reviewing') && (
            <>
              <TextField label="Resolution note" value={res[c.id] ?? ''} onChange={(e) => setRes({ ...res, [c.id]: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                {c.status === 'open' && <Button size="sm" variant="secondary" onClick={() => resolve(c, 'reviewing')}>Start review</Button>}
                {HIDE_TARGET[c.targetType] && <Button size="sm" variant="danger" onClick={() => resolve(c, 'actioned', true)}>Remove content</Button>}
                <Button size="sm" variant="teal" onClick={() => resolve(c, 'actioned')}>Mark actioned</Button>
                <Button size="sm" variant="ghost" onClick={() => resolve(c, 'dismissed')}>Dismiss</Button>
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

function Finance() {
  const payments = useDB((s) => s.payments);
  const enquiries = useDB((s) => s.enquiries);
  const { toast } = useUI();
  const exportCsv = () => {
    const rows = [['invoice', 'date', 'description', 'amount', 'gst', 'status', 'type'], ...payments.map((p) => [p.invoiceNo, p.createdAt, p.description.replace(/,/g, ' '), String(p.amount), String(p.gst), p.status, p.demo ? 'DEMO' : 'ACTUAL'])];
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'one-bhilwara-transactions-demo.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('CSV exported');
  };
  const leadFee = 0;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Demo transactions" value={payments.filter((p) => p.demo).length} /><Stat label="Actual transactions" value={payments.filter((p) => !p.demo).length} hint="Requires payment gateway" />
        <Stat label="Leads generated" value={enquiries.length} hint={`Lead fee configured: ${formatINR(leadFee)}`} /><Stat label="Refund requests" value={payments.filter((p) => p.status === 'refund_requested').length} />
      </div>
      <Button variant="secondary" className="justify-self-start" icon={<Download className="size-4" aria-hidden />} onClick={exportCsv}>Export report (CSV)</Button>
      <ul className="card divide-y divide-line">{payments.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><span className="flex-1"><b>{p.description}</b> · {p.invoiceNo} · {formatDateTime(p.createdAt)}</span>{p.demo && <DemoBadge />}<span>{formatINR(p.amount + p.gst)}</span><StatusPill status={p.status.replace('demo_', '')} />
          {p.status === 'refund_requested' && <><Button size="sm" variant="teal" onClick={() => { repo.patch('payments', p.id, { status: 'refunded' }); audit('refund_approved', p.id); notify(p.userId, 'account', 'Refund approved (demo)', p.description, '/payments'); toast('Refund approved (demo)'); }}>Approve refund</Button><Button size="sm" variant="ghost" onClick={() => { repo.patch('payments', p.id, { status: 'demo_success' }); audit('refund_rejected', p.id); toast('Refund rejected'); }}>Reject</Button></>}</li>
      ))}</ul>
    </div>
  );
}

function PlatformSettings() {
  const settings = useDB((s) => s.settings);
  const { toast } = useUI();
  const [fees, setFees] = useState(settings.fees);
  const update = (patch: Partial<typeof settings>) => store.update((s) => ({ settings: { ...s.settings, ...patch } }));
  return (
    <div className="grid gap-5">
      <section className="card grid gap-3 p-4">
        <h2 className="font-bold text-navy">Fees & commissions</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(fees) as (keyof typeof fees)[]).map((k) => <TextField key={k} label={k.replace(/([A-Z])/g, ' $1').toLowerCase()} inputMode="decimal" value={String(fees[k])} onChange={(e) => setFees({ ...fees, [k]: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} />)}
        </div>
        <Button className="justify-self-start" onClick={() => { update({ fees }); audit('fees_updated', 'settings', JSON.stringify(fees)); toast('Fees saved (audited)'); }}>Save fees</Button>
        <p className="text-xs text-muted">Fees never apply to job applications, essential government information or emergency services.</p>
      </section>
      <section className="card grid gap-1 p-4">
        <h2 className="font-bold text-navy">Feature flags</h2>
        {Object.entries(settings.featureFlags).map(([k, v]) => <Toggle key={k} label={k} checked={v} onChange={(nv) => { update({ featureFlags: { ...settings.featureFlags, [k]: nv } }); audit('feature_flag', k, String(nv)); toast(`${k} ${nv ? 'enabled' : 'disabled'}`); }} />)}
      </section>
      <section className="card grid gap-1 p-4">
        <h2 className="font-bold text-navy">Reward points rules</h2>
        {Object.entries(settings.pointsRules).map(([k, v]) => <div key={k} className="flex items-center justify-between gap-2 text-sm"><span>{k.replace('_', ' ')}</span><input aria-label={`Points for ${k}`} className="input w-24" inputMode="numeric" value={v} onChange={(e) => update({ pointsRules: { ...settings.pointsRules, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 } })} /></div>)}
        <p className="text-xs text-muted">Reviews are fixed at 0 points to avoid incentivised reviews.</p>
      </section>
      <section className="card grid gap-2 p-4">
        <h2 className="font-bold text-navy">Localities (editable sample)</h2>
        <p className="text-sm">{LOCALITIES.filter((l) => l.id !== 'all').map((l) => l.name).join(' · ')}</p>
        <p className="text-xs text-muted">Edit in src/config/catalog.ts (demo) or the localities table in production.</p>
      </section>
      <section className="card grid gap-2 p-4">
        <h2 className="font-bold text-navy">Notification templates</h2>
        {settings.notificationTemplates.map((t) => <div key={t.id}><TextField label={t.name} value={t.text} onChange={(e) => update({ notificationTemplates: settings.notificationTemplates.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)) })} /></div>)}
      </section>
      <section className="card grid gap-2 p-4">
        <h2 className="font-bold text-navy">API configuration status</h2>
        <ul className="grid gap-1 text-sm">{integrations().map((i) => <li key={i.id} className="flex justify-between gap-2"><span>{i.name}</span><StatusPill status={i.configured ? 'active' : 'demo'} /></li>)}</ul>
      </section>
      <section className="card grid gap-2 p-4"><h2 className="font-bold text-navy">Language & policy content</h2><p className="text-sm">Languages: English, Hindi (UI labels). Policy drafts: <Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/terms">Terms</Link> · <Link className="underline" to="/policies/community-guidelines">Guidelines</Link></p></section>
    </div>
  );
}

function AuditLog() {
  const log = useDB((s) => s.audit);
  return log.length === 0 ? <EmptyState title="No admin actions yet" /> : (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead><tr className="border-b border-line text-left text-muted"><th className="p-3">When</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Details</th></tr></thead>
        <tbody>{log.map((a) => <tr key={a.id} className="border-b border-line last:border-0"><td className="p-3">{formatDateTime(a.at)}</td><td className="p-3">{a.actorName}</td><td className="p-3 font-mono text-xs">{a.action}</td><td className="p-3">{a.target}</td><td className="p-3 text-muted">{a.details}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
