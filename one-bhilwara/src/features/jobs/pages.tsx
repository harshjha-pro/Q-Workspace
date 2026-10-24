import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BarChart3, Building2, FileText, Plus, ShieldAlert, Sparkles, UserSearch } from 'lucide-react';
import type { Application, ApplicationStatus, CandidateProfile, Job, RecruitmentRequest } from '@/types/models';
import { JOB_CATEGORIES, localityName } from '@/config/catalog';
import { useCurrentUser, useDB, useDocumentTitle, useLoading, useSession } from '@/hooks/useStore';
import { actorIds, audit, notify, sanitize } from '@/services/domain/common';
import { demoCheckout } from '@/services/adapters/payments';
import { repo } from '@/services/store';
import { JobCard, jobTypeLabel } from '@/components/cards';
import { FilterBar, LoadMore, LOCALITY_OPTIONS, ReportButton, SaveButton, SectionCard, ShareButton, useRequireAuth, usePaged } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, KeyValue, LinkButton, Notice, PageHeader, SkeletonList, SponsoredTag, Stat, StatusPill } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { Checkbox, FilePicker, Select, TextArea, TextField, Toggle } from '@/components/ui/form';
import { formatDate, formatDateTime, formatINR, formatMobile, isValidMobile, salaryLabel, timeAgo } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';
import NotFound from '@/app/NotFound';

const TYPES: { value: Job['type']; label: string }[] = [{ value: 'full_time', label: 'Full-time' }, { value: 'part_time', label: 'Part-time' }, { value: 'internship', label: 'Internship' }, { value: 'wfh', label: 'Work from home' }, { value: 'temporary', label: 'Temporary / seasonal' }];
const STATUSES: ApplicationStatus[] = ['submitted', 'under_review', 'shortlisted', 'interview', 'selected', 'rejected'];

export function JobsPage() {
  useDocumentTitle('Jobs');
  const [params] = useSearchParams();
  const loading = useLoading();
  const jobs = useDB((s) => s.jobs.filter((j) => j.status === 'open'));
  const init = () => ({ q: '', values: { category: params.get('category') ?? '', type: params.get('type') ?? '', locality: '', salary: '' } as Record<string, string>, sort: 'newest', verified: false, featured: false });
  const [f, setF] = useState(init);
  const list = useMemo(() => {
    let l = jobs.filter((j) => (!f.values.category || j.category === f.values.category) && (!f.values.type || j.type === f.values.type) && (!f.values.locality || j.localityId === f.values.locality));
    if (f.q) l = l.filter((j) => `${j.title} ${j.employerName} ${j.skills.join(' ')} ${j.description}`.toLowerCase().includes(f.q.toLowerCase()));
    if (f.values.salary) l = l.filter((j) => j.salaryPeriod === 'month' ? j.salaryMax >= Number(f.values.salary) : j.salaryMax * (j.salaryPeriod === 'day' ? 26 : 208) >= Number(f.values.salary));
    if (f.verified) l = l.filter((j) => j.verifiedEmployer);
    if (f.featured) l = l.filter((j) => j.featured || j.urgent);
    l = [...l].sort((a, b) => f.sort === 'salary' ? b.salaryMax - a.salaryMax : f.sort === 'deadline' ? a.deadline.localeCompare(b.deadline) : Number(!!b.featured) - Number(!!a.featured) || b.createdAt.localeCompare(a.createdAt));
    return l;
  }, [jobs, f]);
  const { visible, hasMore, more } = usePaged(list, 10);
  return (
    <div className="grid gap-5">
      <PageHeader title="Jobs & careers" subtitle="Local full-time, part-time, student and seasonal work. Applying is always free."
        actions={<><LinkButton variant="secondary" to="/applications">My applications</LinkButton><LinkButton to="/employers?tab=post" icon={<Plus className="size-4" aria-hidden />}>Post a job</LinkButton></>} />
      <FilterBar q={f.q} onQ={(q) => setF({ ...f, q })} placeholder="Job title, skill or employer" count={list.length}
        filters={[{ key: 'category', label: 'Category', options: JOB_CATEGORIES }, { key: 'type', label: 'Type', options: TYPES }, { key: 'locality', label: 'Locality', options: LOCALITY_OPTIONS },
          { key: 'salary', label: 'Min salary', options: [{ value: '10000', label: '₹10,000+/mo' }, { value: '15000', label: '₹15,000+/mo' }, { value: '20000', label: '₹20,000+/mo' }] }]}
        values={f.values} onChange={(k, v) => setF({ ...f, values: { ...f.values, [k]: v } })}
        sorts={[{ value: 'newest', label: 'Newest' }, { value: 'salary', label: 'Highest salary' }, { value: 'deadline', label: 'Deadline soon' }]} sort={f.sort} onSort={(sort) => setF({ ...f, sort })}
        toggles={[{ key: 'v', label: 'Verified employers', on: f.verified, set: (v) => setF({ ...f, verified: v }) }, { key: 'f', label: 'Featured & urgent', on: f.featured, set: (v) => setF({ ...f, featured: v }) }]}
        onReset={() => setF({ ...init(), values: { category: '', type: '', locality: '', salary: '' } })} />
      {loading ? <SkeletonList /> : list.length === 0 ? <EmptyState title="No jobs match" text="Remove a filter or set up job alerts in Settings." action={<LinkButton variant="secondary" to="/settings#personalisation">Job preferences</LinkButton>} /> : (
        <><div className="grid gap-3 md:grid-cols-2">{visible.map((j) => <JobCard key={j.id} j={j} />)}</div><LoadMore hasMore={hasMore} onMore={more} /></>
      )}
      <Link to="/recruitment" className="card flex items-center gap-3 p-4 hover:border-navy/30"><UserSearch className="size-7 text-navy" aria-hidden /><span><span className="block font-bold">Hiring? Try assisted recruitment</span><span className="text-sm text-muted">We help shortlist candidates for a disclosed fee.</span></span></Link>
    </div>
  );
}

export function JobPage() {
  const { id = '' } = useParams();
  const j = useDB((s) => s.jobs.find((x) => x.id === id));
  const { userId } = useSession();
  const user = useCurrentUser();
  const existing = useDB((s) => s.applications.find((a) => a.jobId === id && a.userId === userId && a.status !== 'withdrawn'));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', mobile: '', note: '' });
  const [resume, setResume] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const guard = useRequireAuth();
  const { toast } = useUI();
  const nav = useNavigate();
  useDocumentTitle(j?.title ?? 'Job');
  if (!j || j.status === 'removed') return <NotFound />;
  const closed = j.status !== 'open' || j.deadline < new Date().toISOString().slice(0, 10);
  const apply = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (!isValidMobile(form.mobile)) e.mobile = 'Enter a valid 10-digit mobile number.';
    if (!consent) e.consent = 'Consent is required to share your application.';
    setErrors(e);
    if (Object.keys(e).length || busy) return;
    if (repo.list('applications').some((a) => a.jobId === j.id && a.userId === userId && a.status !== 'withdrawn')) { toast('You have already applied for this job.', 'error'); setOpen(false); return; }
    setBusy(true);
    const a: Application = { id: uid('a'), jobId: j.id, jobTitle: j.title, employerName: j.employerName, userId: userId!, applicantName: sanitize(form.name, 80), mobile: form.mobile, coverNote: sanitize(form.note, 1000), status: 'submitted', history: [{ status: 'submitted', at: nowIso() }], createdAt: nowIso(), demo: true };
    repo.insert('applications', a);
    if (j.postedBy) notify(j.postedBy, 'job', 'New application', `${a.applicantName} applied for ${j.title}`, '/employers?tab=applicants');
    setTimeout(() => { setBusy(false); setOpen(false); toast('Application submitted', 'success', { label: 'View', onClick: () => nav('/applications') }); }, 400);
  };
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/jobs" className="hover:underline">Jobs</Link> / {j.category}</nav>
      <header className="card grid gap-3 p-5">
        <div className="flex flex-wrap gap-1.5">{j.featured && <SponsoredTag label="Featured" />}{j.urgent && <Badge tone="red">Urgent hiring</Badge>}{j.verifiedEmployer ? <Badge tone="teal">Verified employer</Badge> : <Badge>Employer not verified</Badge>}{j.demo && <DemoBadge label="Demo job" />}</div>
        <h1 className="text-2xl font-extrabold text-navy">{j.title}</h1>
        <p className="font-semibold text-ink">{j.employerName}</p>
        <KeyValue items={[['Salary', salaryLabel(j.salaryMin, j.salaryMax, j.salaryPeriod)], ['Type', jobTypeLabel(j.type)], ['Location', j.localityId === 'all' ? 'Remote' : localityName(j.localityId)],
          ['Experience', j.experience], ['Education', j.education], ['Apply by', formatDate(j.deadline)], ['Posted', timeAgo(j.createdAt)]]} />
        <div className="flex flex-wrap gap-2">
          {existing ? <LinkButton to="/applications" variant="teal">Applied · {existing.status.replace('_', ' ')}</LinkButton>
            : <Button disabled={closed} onClick={() => guard(() => { setForm({ name: user?.name ?? '', mobile: user?.mobile ?? '', note: '' }); setResume(user?.candidate?.resumeName ? [user.candidate.resumeName] : []); setConsent(false); setErrors({}); setOpen(true); })}>{closed ? 'Applications closed' : 'Apply now'}</Button>}
          <SaveButton type="job" id={j.id} /><ShareButton title={j.title} /><ReportButton targetType="job" targetId={j.id} title={j.title} />
        </div>
      </header>
      <SectionCard title="Job description"><p className="whitespace-pre-line">{j.description}</p></SectionCard>
      <SectionCard title="Skills"><div className="flex flex-wrap gap-2">{j.skills.map((s) => <Badge key={s} tone="navy">{s}</Badge>)}</div></SectionCard>
      <SectionCard title="Benefits"><ul className="list-disc pl-5">{j.benefits.map((b) => <li key={b}>{b}</li>)}</ul></SectionCard>
      <Notice tone="warning" title="Stay safe"><p>Genuine employers never ask for money to apply, for “training fees” or for your bank OTP. Report such requests.</p></Notice>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Apply: ${j.title}`} description={j.employerName}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={apply}>Submit application</Button></>}>
        <div className="grid gap-4">
          <TextField label="Full name" required value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Mobile" required inputMode="numeric" value={form.mobile} error={errors.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <TextArea label="Cover note (optional)" value={form.note} maxLength={1000} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <FilePicker label="Resume (PDF)" accept="application/pdf" value={resume} onChange={setResume} multiple={false} />
          <Checkbox checked={consent} onChange={setConsent} label={`Share my application, name and mobile with ${j.employerName} for this job.`} />
          {errors.consent && <p className="text-xs font-medium text-danger" role="alert">{errors.consent}</p>}
        </div>
      </Dialog>
    </div>
  );
}

export function ApplicationsPage() {
  useDocumentTitle('My applications');
  const { userId } = useSession();
  const user = useCurrentUser();
  const apps = useDB((s) => s.applications.filter((a) => a.userId === userId));
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState<'apps' | 'profile'>('apps');
  return (
    <div className="grid gap-5">
      <PageHeader title="Job seeker dashboard" subtitle="Track applications and manage your candidate profile." />
      <Tabs label="Dashboard" value={tab} onChange={setTab} tabs={[{ id: 'apps', label: 'Applications', count: apps.length }, { id: 'profile', label: 'Candidate profile' }]} />
      {tab === 'apps' ? (apps.length === 0 ? <EmptyState title="No applications yet" text="Applications you submit appear here with live status." action={<LinkButton to="/jobs">Browse jobs</LinkButton>} /> : (
        <ul className="grid gap-3">
          {apps.map((a) => (
            <li key={a.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/jobs/${a.jobId}`} className="font-bold text-navy">{a.jobTitle}</Link><StatusPill status={a.status} /></div>
              <p className="text-sm text-muted">{a.employerName} · Applied {formatDate(a.createdAt)}</p>
              <ol className="mt-2 flex flex-wrap gap-2 text-xs text-muted">{a.history.map((h, i) => <li key={i} className="rounded bg-page px-2 py-1 capitalize">{h.status.replace('_', ' ')} · {formatDate(h.at)}</li>)}</ol>
              {!['withdrawn', 'rejected', 'selected'].includes(a.status) && <Button size="sm" variant="ghost" className="mt-2" onClick={async () => {
                if (await confirm({ title: 'Withdraw application?', message: 'The employer will see it as withdrawn.', danger: true, confirmLabel: 'Withdraw' })) { repo.at('applications').mutate(a.id, (c) => ({ status: 'withdrawn', history: [...c.history, { status: 'withdrawn', at: nowIso() }] })); toast('Application withdrawn'); }
              }}>Withdraw</Button>}
            </li>
          ))}
        </ul>
      )) : user && <CandidateForm initial={user.candidate} onSave={(c) => { repo.patch('users', user.id, { candidate: c }); toast('Profile saved'); }} />}
    </div>
  );
}

function CandidateForm({ initial, onSave }: { initial?: CandidateProfile; onSave: (c: CandidateProfile) => void }) {
  const [c, setC] = useState<CandidateProfile>(initial ?? { headline: '', education: '', skills: [], experienceYears: 0, preferredRole: '', preferredSalary: 0, preferredLocalityId: 'shastri-nagar', availability: 'immediate', visibility: 'private' });
  const [skills, setSkills] = useState(c.skills.join(', '));
  return (
    <form className="card grid gap-4 p-4" onSubmit={(e) => { e.preventDefault(); onSave({ ...c, headline: sanitize(c.headline, 120), skills: skills.split(',').map((s) => sanitize(s, 40)).filter(Boolean).slice(0, 15) }); }}>
      <TextField label="Headline" value={c.headline} onChange={(e) => setC({ ...c, headline: e.target.value })} placeholder="e.g. B.Com graduate with Tally experience" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Education" value={c.education} onChange={(e) => setC({ ...c, education: e.target.value })} />
        <TextField label="Experience (years)" inputMode="numeric" value={String(c.experienceYears)} onChange={(e) => setC({ ...c, experienceYears: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
        <TextField label="Preferred role" value={c.preferredRole} onChange={(e) => setC({ ...c, preferredRole: e.target.value })} />
        <TextField label="Preferred salary (₹/month)" inputMode="numeric" value={String(c.preferredSalary || '')} onChange={(e) => setC({ ...c, preferredSalary: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
        <Select label="Preferred locality" value={c.preferredLocalityId} onChange={(e) => setC({ ...c, preferredLocalityId: e.target.value })} options={LOCALITY_OPTIONS} />
        <Select label="Availability" value={c.availability} onChange={(e) => setC({ ...c, availability: e.target.value as CandidateProfile['availability'] })} options={[{ value: 'immediate', label: 'Immediate' }, { value: '15_days', label: 'Within 15 days' }, { value: '30_days', label: 'Within 30 days' }, { value: 'part_time', label: 'Part-time only' }]} />
      </div>
      <TextField label="Skills (comma separated)" value={skills} onChange={(e) => setSkills(e.target.value)} />
      <FilePicker label="Resume" accept="application/pdf" value={c.resumeName ? [c.resumeName] : []} onChange={(n) => setC({ ...c, resumeName: n[0] })} multiple={false} />
      <Toggle label="Visible to employers" description="When off, only employers you apply to can see your profile. Your mobile number is never shown publicly." checked={c.visibility === 'employers'} onChange={(v) => setC({ ...c, visibility: v ? 'employers' : 'private' })} />
      <Button type="submit" className="justify-self-start">Save profile</Button>
    </form>
  );
}

export function EmployersPage() {
  useDocumentTitle('Employer dashboard');
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'overview') as 'overview' | 'jobs' | 'post' | 'applicants';
  const { userId, role } = useSession();
  const ids = actorIds(userId, role);
  const jobs = useDB((s) => s.jobs.filter((j) => j.postedBy && ids.includes(j.postedBy)));
  const apps = useDB((s) => s.applications.filter((a) => jobs.some((j) => j.id === a.jobId)));
  const [edit, setEdit] = useState<Job | null>(null);
  const { toast } = useUI();
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });
  return (
    <div className="grid gap-5">
      <PageHeader title="Employer dashboard" subtitle="Post jobs, review applicants and track hiring." badge={<DemoBadge label="Demo employer" />} actions={<LinkButton to="/pricing?audience=employer" variant="secondary">Job packages</LinkButton>} />
      <Tabs label="Employer" value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'jobs', label: 'My jobs', count: jobs.length }, { id: 'applicants', label: 'Applicants', count: apps.length }, { id: 'post', label: 'Post a job' }]} />
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Open jobs" value={jobs.filter((j) => j.status === 'open').length} />
            <Stat label="Applications" value={apps.length} />
            <Stat label="Shortlisted" value={apps.filter((a) => ['shortlisted', 'interview'].includes(a.status)).length} />
            <Stat label="Hired" value={apps.filter((a) => a.status === 'selected').length} />
          </div>
          <SectionCard title="Company profile" actions={<Building2 className="size-5 text-muted" aria-hidden />}>
            <p className="text-sm text-muted">Company details appear on your job posts. Verification requires documents reviewed by One Bhilwara (demo: request below).</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => toast('Verification request noted (demo). An admin reviews employer documents in production.', 'info')}>Request employer verification</Button>
          </SectionCard>
          <SectionCard title="Hiring activity" actions={<BarChart3 className="size-5 text-muted" aria-hidden />}>
            <ul className="grid gap-1 text-sm">{STATUSES.map((s) => <li key={s} className="flex justify-between"><span className="capitalize">{s.replace('_', ' ')}</span><span className="tabular-nums">{apps.filter((a) => a.status === s).length}</span></li>)}</ul>
          </SectionCard>
        </>
      )}
      {tab === 'jobs' && (jobs.length === 0 ? <EmptyState title="No jobs posted" action={<Button onClick={() => setTab('post')}>Post a job</Button>} /> : (
        <ul className="grid gap-3">{jobs.map((j) => (
          <li key={j.id} className="card flex flex-wrap items-center gap-3 p-4">
            <span className="min-w-0 flex-1"><Link to={`/jobs/${j.id}`} className="font-semibold">{j.title}</Link><span className="block text-sm text-muted">{apps.filter((a) => a.jobId === j.id).length} applicants · deadline {formatDate(j.deadline)}</span></span>
            <StatusPill status={j.status} />
            <Button size="sm" variant="secondary" onClick={() => setEdit(j)}>Edit</Button>
            {j.status === 'open' ? <Button size="sm" variant="ghost" onClick={() => { repo.patch('jobs', j.id, { status: 'closed' }); toast('Job closed'); }}>Close</Button>
              : j.status === 'closed' && <Button size="sm" variant="ghost" onClick={() => { repo.patch('jobs', j.id, { status: 'open' }); toast('Job reopened'); }}>Reopen</Button>}
          </li>))}
        </ul>
      ))}
      {tab === 'applicants' && <Applicants apps={apps} />}
      {tab === 'post' && <JobForm onDone={() => setTab('jobs')} />}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title="Edit job" size="lg">{edit && <JobForm job={edit} onDone={() => setEdit(null)} />}</Dialog>
    </div>
  );
}

function Applicants({ apps }: { apps: Application[] }) {
  const { toast } = useUI();
  const [job, setJob] = useState('');
  const list = apps.filter((a) => !job || a.jobTitle === job);
  if (apps.length === 0) return <EmptyState title="No applicants yet" text="Applications to your jobs appear here." />;
  return (
    <div className="grid gap-3">
      <select aria-label="Filter by job" className="input min-h-10 w-full text-sm sm:w-72" value={job} onChange={(e) => setJob(e.target.value)}><option value="">All jobs</option>{Array.from(new Set(apps.map((a) => a.jobTitle))).map((t) => <option key={t}>{t}</option>)}</select>
      <ul className="grid gap-3">
        {list.map((a) => (
          <li key={a.id} className="card grid gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{a.applicantName} <span className="font-normal text-muted">· {a.jobTitle}</span></p><StatusPill status={a.status} /></div>
            {a.coverNote && <p className="text-sm">“{a.coverNote}”</p>}
            <p className="text-sm text-muted">Contact (shared with consent): {formatMobile(a.mobile)} · Applied {timeAgo(a.createdAt)}</p>
            {a.status !== 'withdrawn' && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`st-${a.id}`}>Update status</label>
                <select id={`st-${a.id}`} className="input min-h-9 w-auto text-sm" value={a.status} onChange={(e) => {
                  const status = e.target.value as ApplicationStatus;
                  repo.at('applications').mutate(a.id, (c) => ({ status, history: [...c.history, { status, at: nowIso() }] }));
                  notify(a.userId, 'job', 'Application update', `${a.jobTitle}: ${status.replace('_', ' ')}`, '/applications');
                  toast('Status updated — candidate notified (in-app)');
                }}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
                <a href={`tel:${a.mobile}`} className="text-sm font-semibold text-teal underline">Call candidate</a>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobForm({ job, onDone }: { job?: Job; onDone: () => void }) {
  const { userId } = useSession();
  const user = useCurrentUser();
  const fees = useDB((s) => s.settings.fees);
  const { toast } = useUI();
  const [f, setF] = useState({ title: job?.title ?? '', employerName: job?.employerName ?? user?.name ?? '', category: job?.category ?? JOB_CATEGORIES[0], type: job?.type ?? 'full_time' as Job['type'], localityId: job?.localityId ?? 'shastri-nagar', salaryMin: String(job?.salaryMin ?? ''), salaryMax: String(job?.salaryMax ?? ''), salaryPeriod: job?.salaryPeriod ?? 'month' as Job['salaryPeriod'], experience: job?.experience ?? '', education: job?.education ?? '', skills: job?.skills.join(', ') ?? '', description: job?.description ?? '', benefits: job?.benefits.join(', ') ?? '', deadline: job?.deadline ?? new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10) });
  const [featured, setFeatured] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const extra = (featured ? fees.featuredJob : 0) + (urgent ? fees.urgentJob : 0);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (sanitize(f.title).length < 3) e.title = 'Job title is required.';
    if (!f.employerName.trim()) e.employerName = 'Employer name is required.';
    if (!(Number(f.salaryMin) > 0) || !(Number(f.salaryMax) >= Number(f.salaryMin))) e.salary = 'Enter a valid salary range (max ≥ min).';
    if (sanitize(f.description).length < 20) e.description = 'Describe the role (20+ characters).';
    if (/fee|deposit|registration charge/i.test(f.description)) e.description = 'Job posts cannot ask candidates to pay fees.';
    setErrors(e);
    if (Object.keys(e).length || busy) return;
    setBusy(true);
    const data = { title: sanitize(f.title, 100), employerName: sanitize(f.employerName, 100), category: f.category, type: f.type, localityId: f.localityId, salaryMin: Number(f.salaryMin), salaryMax: Number(f.salaryMax), salaryPeriod: f.salaryPeriod, experience: sanitize(f.experience, 60) || 'Not specified', education: sanitize(f.education, 60) || 'Not specified', skills: f.skills.split(',').map((s) => sanitize(s, 40)).filter(Boolean), description: sanitize(f.description, 3000), benefits: f.benefits.split(',').map((s) => sanitize(s, 60)).filter(Boolean), deadline: f.deadline };
    if (extra > 0) {
      const p = await demoCheckout({ description: `Job post add-ons: ${[featured && 'Featured', urgent && 'Urgent'].filter(Boolean).join(' + ')}`, amount: extra, kind: 'job_package' });
      if (p.status !== 'demo_success') { setBusy(false); toast('Demo payment failed', 'error'); return; }
    }
    if (job) { repo.patch('jobs', job.id, data); toast('Job updated'); }
    else {
      // New posts go to moderation before appearing publicly.
      repo.insert('jobs', { id: uid('j'), ...data, verifiedEmployer: false, status: 'pending_review', featured, urgent, postedBy: userId!, employerId: userId!, createdAt: nowIso(), demo: true });
      audit('job_submitted', data.title);
      toast(extra ? 'Job submitted for review · demo payment recorded (no money charged)' : 'Job submitted for review');
    }
    setBusy(false);
    onDone();
  };
  return (
    <form className="card grid gap-4 p-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Job title" required value={f.title} error={errors.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <TextField label="Employer / company" required value={f.employerName} error={errors.employerName} onChange={(e) => setF({ ...f, employerName: e.target.value })} />
        <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={JOB_CATEGORIES} />
        <Select label="Employment type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Job['type'] })} options={TYPES} />
        <Select label="Locality" value={f.localityId} onChange={(e) => setF({ ...f, localityId: e.target.value })} options={[{ value: 'all', label: 'Remote / anywhere' }, ...LOCALITY_OPTIONS]} />
        <TextField label="Apply by" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
        <TextField label="Salary from (₹)" required inputMode="numeric" value={f.salaryMin} error={errors.salary} onChange={(e) => setF({ ...f, salaryMin: e.target.value.replace(/\D/g, '') })} />
        <TextField label="Salary to (₹)" required inputMode="numeric" value={f.salaryMax} onChange={(e) => setF({ ...f, salaryMax: e.target.value.replace(/\D/g, '') })} />
        <Select label="Salary per" value={f.salaryPeriod} onChange={(e) => setF({ ...f, salaryPeriod: e.target.value as Job['salaryPeriod'] })} options={[{ value: 'month', label: 'Month' }, { value: 'day', label: 'Day' }, { value: 'hour', label: 'Hour' }]} />
        <TextField label="Experience required" value={f.experience} onChange={(e) => setF({ ...f, experience: e.target.value })} />
        <TextField label="Education" value={f.education} onChange={(e) => setF({ ...f, education: e.target.value })} />
        <TextField label="Skills (comma separated)" value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} />
      </div>
      <TextArea label="Job description" required value={f.description} error={errors.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <TextField label="Benefits (comma separated)" value={f.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} />
      {!job && (
        <div className="rounded-lg border border-line p-3">
          <p className="mb-1 flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-amber" aria-hidden />Optional paid features</p>
          <Checkbox checked={featured} onChange={setFeatured} label={`Featured job — ${formatINR(fees.featuredJob)}`} description="Shown higher in results with a “Featured” label." />
          <div className="mt-2"><Checkbox checked={urgent} onChange={setUrgent} label={`Urgent hiring badge — ${formatINR(fees.urgentJob)}`} /></div>
          {extra > 0 && <p className="mt-2 text-sm">Total {formatINR(extra)} + GST · <span className="text-muted">demo checkout, no money is charged</span></p>}
        </div>
      )}
      <p className="text-xs text-muted">Posts are reviewed by moderators. Never ask candidates for money. Applying on One Bhilwara is always free for job seekers.</p>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onDone}>Cancel</Button><Button type="submit" loading={busy}>{job ? 'Save changes' : 'Submit job'}</Button></div>
    </form>
  );
}

export function RecruitmentPage() {
  useDocumentTitle('Assisted recruitment');
  const { userId } = useSession();
  const pct = useDB((s) => s.settings.fees.recruitmentFeePercent);
  const mine = useDB((s) => s.recruitment.filter((r) => r.userId === userId));
  const guard = useRequireAuth();
  const { toast } = useUI();
  const [f, setF] = useState({ company: '', role: '', category: JOB_CATEGORIES[0], experience: '', budget: '', localityId: 'shastri-nagar', openings: '1' });
  const [ok, setOk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-5">
      <PageHeader title="Assisted recruitment" subtitle="Tell us the role — a recruiter sources and shortlists candidates for you." badge={<DemoBadge label="Demo service" />} />
      <Notice tone="info" title="Fees and terms">Service fee: {pct}% of the first month’s salary per successful hire (configurable by admin). Charged to the employer only, under a written agreement. Candidates are never charged and no salary deductions are made.</Notice>
      <div className="grid gap-5 lg:grid-cols-2">
        <form className="card grid gap-3 p-4" noValidate onSubmit={(e) => { e.preventDefault(); guard(() => {
          const er: Record<string, string> = {};
          if (!f.company.trim()) er.company = 'Company is required.';
          if (!f.role.trim()) er.role = 'Role is required.';
          if (!(Number(f.budget) > 0)) er.budget = 'Enter a monthly salary budget.';
          if (!ok) er.ok = 'Please accept the fee terms.';
          setErrors(er);
          if (Object.keys(er).length) return;
          const r: RecruitmentRequest = { id: uid('rr'), userId: userId!, company: sanitize(f.company, 100), role: sanitize(f.role, 100), category: f.category, experience: sanitize(f.experience, 60), budget: Number(f.budget), localityId: f.localityId, openings: Number(f.openings) || 1, feeAccepted: true, status: 'received', createdAt: nowIso(), demo: true };
          repo.insert('recruitment', r); toast('Requirement received (demo)'); setOk(false);
        }); }}>
          <TextField label="Company" required value={f.company} error={errors.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
          <TextField label="Role to fill" required value={f.role} error={errors.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={JOB_CATEGORIES} />
            <TextField label="Experience" value={f.experience} onChange={(e) => setF({ ...f, experience: e.target.value })} />
            <TextField label="Salary budget (₹/mo)" required inputMode="numeric" value={f.budget} error={errors.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/\D/g, '') })} />
            <TextField label="Openings" inputMode="numeric" value={f.openings} onChange={(e) => setF({ ...f, openings: e.target.value.replace(/\D/g, '') })} />
          </div>
          <Select label="Location" value={f.localityId} onChange={(e) => setF({ ...f, localityId: e.target.value })} options={LOCALITY_OPTIONS} />
          <Checkbox checked={ok} onChange={setOk} label="I agree to the disclosed recruitment fee terms." />
          {errors.ok && <p className="text-xs font-medium text-danger" role="alert">{errors.ok}</p>}
          <Button type="submit">Submit requirement</Button>
        </form>
        <section className="grid content-start gap-3">
          <h2 className="font-bold text-navy">Your requests</h2>
          {mine.length === 0 ? <EmptyState icon={<FileText className="size-6" aria-hidden />} title="No requests yet" /> : mine.map((r) => (
            <div key={r.id} className="card p-4"><div className="flex justify-between gap-2"><p className="font-semibold">{r.role} · {r.company}</p><StatusPill status={r.status} /></div><p className="text-sm text-muted">{r.openings} opening(s) · {formatINR(r.budget)}/mo · {localityName(r.localityId)} · {formatDateTime(r.createdAt)}</p></div>
          ))}
        </section>
      </div>
      <Notice tone="warning"><span className="inline-flex items-center gap-1"><ShieldAlert className="size-4" aria-hidden />Recruitment charges require contractual terms and legal review before going live.</span></Notice>
    </div>
  );
}
