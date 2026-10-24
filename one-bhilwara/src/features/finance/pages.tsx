import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarCheck, Info, Scale } from 'lucide-react';
import { FINANCE_CATEGORIES, localityName, PROFESSIONS } from '@/config/catalog';
import { financeProducts } from '@/data/seed/directory';
import { useDB, useDocumentTitle, useLoading, useSession } from '@/hooks/useStore';
import { sanitize } from '@/services/domain/common';
import { repo } from '@/services/store';
import { ProfessionalCard } from '@/components/cards';
import { EnquiryInbox } from '@/components/inbox';
import { EnquiryButton, FilterBar, LOCALITY_OPTIONS, ReportButton, ReviewsSection, SaveButton, SectionCard, ShareButton, useRequireAuth } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, KeyValue, Notice, PageHeader, Rating, SkeletonList, VerificationBadge } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { TextField } from '@/components/ui/form';
import { nowIso, uid } from '@/utils/ids';
import NotFound from '@/app/NotFound';

export function FinancePage() {
  useDocumentTitle('Finance');
  const { role } = useSession();
  const [tab, setTab] = useState<'products' | 'leads'>('products');
  const [cat, setCat] = useState('');
  const leads = useDB((s) => s.enquiries.filter((q) => q.targetType === 'finance'));
  const products = financeProducts().filter((p) => !cat || p.category === cat);
  const canSeeLeads = role === 'business' || role === 'admin';
  return (
    <div className="grid gap-5">
      <PageHeader title="Finance & experts" subtitle="Accounts, loans, insurance and cards from listed providers — plus local professionals." actions={<Link to="/professionals" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 font-semibold"><Scale className="size-4" aria-hidden />Professionals</Link>} />
      <Notice tone="warning" title="Important disclosures">
        <ul className="mt-1 list-disc pl-4">
          <li>One Bhilwara does not lend, issue cards or sell insurance. Eligibility, rates, fees and approval are decided by each provider.</li>
          <li>We may receive a referral fee from providers marked “Referral partner”. Listings are not an independent comparison or advice.</li>
          <li>Your details are shared only with the provider you choose, after you consent.</li>
        </ul>
      </Notice>
      {canSeeLeads && <Tabs label="Finance" value={tab} onChange={setTab} tabs={[{ id: 'products', label: 'Products' }, { id: 'leads', label: 'Provider lead dashboard', count: leads.length }]} />}
      {tab === 'leads' && canSeeLeads ? <EnquiryInbox items={leads} /> : (
        <>
          <div className="scroll-x">{['', ...FINANCE_CATEGORIES].map((c) => <button key={c || 'all'} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c || 'All'}</button>)}</div>
          {products.length === 0 ? <EmptyState title="No products in this category yet" /> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {products.map((p) => (
                <li key={p.id} className="card grid gap-2 p-4">
                  <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{p.category}</Badge>{p.commission && <Badge tone="violet">Referral partner</Badge>}<DemoBadge label="Illustrative" /></div>
                  <p className="font-bold">{p.title}</p>
                  <p className="text-sm text-muted">{p.provider}</p>
                  <p className="text-sm">{p.summary}</p>
                  <ul className="list-disc pl-5 text-sm text-muted">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                  {p.provider !== 'Information only' && <EnquiryButton targetType="finance" targetId={p.id} targetName={p.provider} label="Request a call-back" variant="secondary" purpose={`So ${p.provider} can contact you about “${p.title}”. They decide eligibility and terms.`} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function ProfessionalsPage() {
  useDocumentTitle('Professionals');
  const loading = useLoading();
  const all = useDB((s) => s.professionals);
  const init = () => ({ q: '', values: { profession: '', locality: '' } as Record<string, string>, sort: 'rating', verified: false });
  const [f, setF] = useState(init);
  const list = useMemo(() => {
    let l = all.filter((p) => (!f.values.profession || p.profession === f.values.profession) && (!f.values.locality || p.localityId === f.values.locality) && (!f.verified || p.verification === 'verified'));
    if (f.q) l = l.filter((p) => `${p.name} ${p.services.join(' ')}`.toLowerCase().includes(f.q.toLowerCase()));
    return [...l].sort((a, b) => (f.sort === 'name' ? a.name.localeCompare(b.name) : b.rating - a.rating));
  }, [all, f]);
  return (
    <div className="grid gap-5">
      <PageHeader title="Professional services" subtitle="CAs, lawyers, tax consultants, insurance advisors and more." />
      <FilterBar q={f.q} onQ={(q) => setF({ ...f, q })} placeholder="Service, e.g. GST returns" count={list.length}
        filters={[{ key: 'profession', label: 'Profession', options: PROFESSIONS }, { key: 'locality', label: 'Locality', options: LOCALITY_OPTIONS }]} values={f.values} onChange={(k, v) => setF({ ...f, values: { ...f.values, [k]: v } })}
        sorts={[{ value: 'rating', label: 'Rating' }, { value: 'name', label: 'Name' }]} sort={f.sort} onSort={(sort) => setF({ ...f, sort })}
        toggles={[{ key: 'v', label: 'Verified only', on: f.verified, set: (v) => setF({ ...f, verified: v }) }]} onReset={() => setF(init())} />
      {loading ? <SkeletonList /> : list.length === 0 ? <EmptyState title="No professionals match" /> : <div className="grid gap-3 md:grid-cols-2">{list.map((p) => <ProfessionalCard key={p.id} p={p} />)}</div>}
      <p className="text-xs text-muted"><Info className="mr-1 inline size-3.5" aria-hidden />Credentials are shown as supplied by the professional unless marked verified. Check registration with the relevant professional body.</p>
    </div>
  );
}

export function ProfessionalPage() {
  const { id = '' } = useParams();
  const p = useDB((s) => s.professionals.find((x) => x.id === id));
  const { userId } = useSession();
  const guard = useRequireAuth();
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState({ date: '', time: '', topic: '' });
  useDocumentTitle(p?.name ?? 'Professional');
  if (!p) return <NotFound />;
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/professionals" className="hover:underline">Professionals</Link> / {p.profession}</nav>
      <header className="card grid gap-3 p-5">
        <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{p.profession}</Badge><VerificationBadge status={p.verification} />{p.demo && <DemoBadge label="Demo record" />}</div>
        <h1 className="text-2xl font-extrabold text-navy">{p.name}</h1>
        <Rating value={p.rating} count={p.reviewCount} size="md" />
        <KeyValue items={[['Qualifications', p.qualifications ? `${p.qualifications}` : 'Not supplied'], ['Credential status', p.qualificationsVerified ? 'Verified by One Bhilwara' : 'Not verified'], ['Experience', p.experience], ['Location', localityName(p.localityId)]]} />
        <div className="flex flex-wrap gap-2">
          <EnquiryButton targetType="professional" targetId={p.id} targetName={p.name} purpose="So the professional can respond to your question. This is not legal or tax advice." />
          <Button variant="secondary" icon={<CalendarCheck className="size-4" aria-hidden />} onClick={() => guard(() => setOpen(true))}>Request appointment</Button>
          <SaveButton type="professional" id={p.id} /><ShareButton title={p.name} /><ReportButton targetType="professional" targetId={p.id} title={p.name} />
        </div>
      </header>
      <SectionCard title="Services"><div className="flex flex-wrap gap-2">{p.services.map((s) => <Badge key={s} tone="navy">{s}</Badge>)}</div></SectionCard>
      <ReviewsSection targetType="professional" targetId={p.id} targetName={p.name} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Request appointment" description={p.name}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => {
          if (!slot.date || !slot.time) { toast('Choose a date and time.', 'error'); return; }
          repo.insert('enquiries', { id: uid('q'), targetType: 'professional', targetId: p.id, targetName: p.name, fromUserId: userId!, name: 'Appointment request', mobile: '', message: `Appointment request for ${slot.date} ${slot.time}. ${sanitize(slot.topic, 300)}`, consent: true, preferredTime: `${slot.date} ${slot.time}`, status: 'new', replies: [], createdAt: nowIso(), demo: true });
          setOpen(false); toast('Appointment request saved (demo). The professional confirms the slot.');
        }}>Send request</Button></>}>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3"><TextField label="Preferred date" type="date" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} /><TextField label="Preferred time" type="time" value={slot.time} onChange={(e) => setSlot({ ...slot, time: e.target.value })} /></div>
          <TextField label="Topic (optional)" value={slot.topic} onChange={(e) => setSlot({ ...slot, topic: e.target.value })} />
        </div>
      </Dialog>
    </div>
  );
}

