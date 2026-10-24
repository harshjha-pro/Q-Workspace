import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, Globe, GraduationCap } from 'lucide-react';
import { EDUCATION_CATEGORIES, localityName } from '@/config/catalog';
import { useDB, useDocumentTitle, useLoading, useSession } from '@/hooks/useStore';
import { EventCard, InstitutionCard, JobCard, PropertyCard } from '@/components/cards';
import { CallButton, DirectionsButton, EnquiryButton, FilterBar, LOCALITY_OPTIONS, ReportButton, ReviewsSection, SaveButton, SectionCard, ShareButton } from '@/components/shared';
import { Badge, DemoBadge, EmptyState, ImagePlaceholder, LinkButton, Notice, PageHeader, Rating, SkeletonList, StatusPill, VerificationBadge } from '@/components/ui/primitives';
import { timeAgo } from '@/utils/format';
import NotFound from '@/app/NotFound';

export function EducationPage() {
  useDocumentTitle('Education');
  const loading = useLoading();
  const all = useDB((s) => s.institutions);
  const init = () => ({ q: '', values: { category: '', locality: '' } as Record<string, string>, sort: 'rating', verified: false });
  const [f, setF] = useState(init);
  const list = useMemo(() => {
    let l = all.filter((i) => (!f.values.category || i.category === f.values.category) && (!f.values.locality || i.localityId === f.values.locality) && (!f.verified || i.verification === 'verified'));
    if (f.q) l = l.filter((i) => `${i.name} ${i.courses.join(' ')} ${i.category}`.toLowerCase().includes(f.q.toLowerCase()));
    return [...l].sort((a, b) => (f.sort === 'name' ? a.name.localeCompare(b.name) : b.rating - a.rating));
  }, [all, f]);
  return (
    <div className="grid gap-5">
      <PageHeader title="Education" subtitle="Schools, colleges, coaching, tuition, skills and libraries." actions={<LinkButton variant="secondary" to="/student" icon={<GraduationCap className="size-4" aria-hidden />}>Student dashboard</LinkButton>} />
      <div className="scroll-x">{['', ...EDUCATION_CATEGORIES].map((c) => <button key={c || 'all'} type="button" className="chip" aria-pressed={f.values.category === c} onClick={() => setF({ ...f, values: { ...f.values, category: c } })}>{c || 'All'}</button>)}</div>
      <FilterBar q={f.q} onQ={(q) => setF({ ...f, q })} placeholder="Course, subject or institution" count={list.length}
        filters={[{ key: 'locality', label: 'Locality', options: LOCALITY_OPTIONS }]} values={f.values} onChange={(k, v) => setF({ ...f, values: { ...f.values, [k]: v } })}
        sorts={[{ value: 'rating', label: 'Rating' }, { value: 'name', label: 'Name' }]} sort={f.sort} onSort={(sort) => setF({ ...f, sort })}
        toggles={[{ key: 'v', label: 'Verified only', on: f.verified, set: (v) => setF({ ...f, verified: v }) }]} onReset={() => setF(init())} />
      {loading ? <SkeletonList /> : list.length === 0 ? <EmptyState title="No institutions match" text="Try another category." /> : <div className="grid gap-3 md:grid-cols-2">{list.map((i) => <InstitutionCard key={i.id} i={i} />)}</div>}
      <section className="grid gap-3 sm:grid-cols-3">
        <Link to="/property/students" className="card p-4 font-semibold hover:border-navy/30">Student accommodation →</Link>
        <Link to="/jobs?type=part_time" className="card p-4 font-semibold hover:border-navy/30">Part-time & student jobs →</Link>
        <Link to="/events" className="card p-4 font-semibold hover:border-navy/30">Workshops & educational events →</Link>
      </section>
    </div>
  );
}

export function InstitutionPage() {
  const { id = '' } = useParams();
  const i = useDB((s) => s.institutions.find((x) => x.id === id));
  useDocumentTitle(i?.name ?? 'Institution');
  if (!i) return <NotFound />;
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/education" className="hover:underline">Education</Link> / {i.category}</nav>
      <header className="card grid gap-3 p-5">
        <div className="flex gap-3">
          <ImagePlaceholder seed={i.id} className="size-20 shrink-0 rounded-2xl" icon={<BookOpen className="size-8" aria-hidden />} label="Institution photo placeholder" />
          <div><div className="flex flex-wrap gap-1.5"><Badge tone="navy">{i.category}</Badge><VerificationBadge status={i.verification} />{i.demo && <DemoBadge label="Demo record" />}</div>
            <h1 className="mt-1 text-2xl font-extrabold text-navy">{i.name}</h1><p className="text-muted">{localityName(i.localityId)}, Bhilwara</p><Rating value={i.rating} count={i.reviewCount} /></div>
        </div>
        <p>{i.description}</p>
        <div className="flex flex-wrap gap-2">
          <EnquiryButton targetType="institution" targetId={i.id} targetName={i.name} purpose="So the institution can answer your admission or course question." label="Admission enquiry" />
          <CallButton phone={i.phone} name={i.name} /><DirectionsButton query={`${i.name.replace(' (Demo)', '')} ${localityName(i.localityId)} Bhilwara`} />
          {i.website ? <a href={i.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold"><Globe className="size-4" aria-hidden />Website</a> : null}
          <SaveButton type="institution" id={i.id} /><ShareButton title={i.name} /><ReportButton targetType="institution" targetId={i.id} title={i.name} />
        </div>
      </header>
      <SectionCard title="Courses & services"><div className="flex flex-wrap gap-2">{i.courses.map((c) => <Badge key={c} tone="navy">{c}</Badge>)}</div></SectionCard>
      <SectionCard title="Admissions"><p className="text-sm">{i.admission ?? 'Admission details have not been supplied by the institution.'}</p></SectionCard>
      <Notice tone="info">One Bhilwara does not verify accreditation, affiliation, results or placement claims. Check with the relevant board or university.</Notice>
      <ReviewsSection targetType="institution" targetId={i.id} targetName={i.name} />
    </div>
  );
}

export function StudentDashboardPage() {
  useDocumentTitle('Student dashboard');
  const { userId } = useSession();
  const saved = useDB((s) => s.saved.filter((x) => x.userId === userId));
  const db = useDB((s) => s);
  const insts = db.institutions.filter((i) => saved.some((s) => s.type === 'institution' && s.id === i.id));
  const stays = db.properties.filter((p) => saved.some((s) => s.type === 'property' && s.id === p.id));
  const jobs = db.jobs.filter((j) => saved.some((s) => s.type === 'job' && s.id === j.id) || (j.type === 'part_time' && j.status === 'open')).slice(0, 4);
  const events = db.events.filter((e) => ['Workshop', 'Exhibition'].includes(e.category)).slice(0, 3);
  const leads = db.enquiries.filter((q) => q.fromUserId === userId && q.targetType === 'institution');
  return (
    <div className="grid gap-6">
      <PageHeader title="Student dashboard" subtitle="Your saved institutions, stays, jobs and opportunities." />
      <section><h2 className="mb-2 text-lg font-bold text-navy">Saved institutions</h2>{insts.length ? <div className="grid gap-3 md:grid-cols-2">{insts.map((i) => <InstitutionCard key={i.id} i={i} />)}</div> : <EmptyState title="None saved yet" action={<LinkButton variant="secondary" to="/education">Browse education</LinkButton>} />}</section>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Saved accommodation</h2>{stays.length ? <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">{stays.map((p) => <PropertyCard key={p.id} p={p} />)}</div> : <EmptyState title="No saved stays" action={<LinkButton variant="secondary" to="/property/students">Find a PG</LinkButton>} />}</section>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Jobs for students</h2><div className="grid gap-3 md:grid-cols-2">{jobs.map((j) => <JobCard key={j.id} j={j} />)}</div></section>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Educational events</h2><div className="grid gap-3 md:grid-cols-3">{events.map((e) => <EventCard key={e.id} e={e} />)}</div></section>
      <SectionCard title="My institution enquiries">{leads.length ? leads.map((q) => <div key={q.id} className="flex justify-between py-2 text-sm"><span>{q.targetName} · {timeAgo(q.createdAt)}</span><StatusPill status={q.status} /></div>) : <p className="text-sm text-muted">No enquiries yet.</p>}</SectionCard>
    </div>
  );
}
