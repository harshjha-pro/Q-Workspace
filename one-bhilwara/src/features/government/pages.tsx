import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleHelp, ExternalLink, FileCheck2, Landmark, ListChecks, XCircle } from 'lucide-react';
import { localityName } from '@/config/catalog';
import { useDB, useDocumentTitle } from '@/hooks/useStore';
import { assess, type EligibilityAnswers, type EligibilityResult } from '@/services/domain/eligibility';
import { EnquiryButton, SaveButton, SectionCard, ShareButton } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, LinkButton, Notice, PageHeader, VerificationBadge } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/overlay';
import { Checkbox, Select, TextField } from '@/components/ui/form';
import { formatDate, formatINR } from '@/utils/format';
import NotFound from '@/app/NotFound';

const CATEGORIES = ['Farmer schemes', 'Student scholarships', 'Women and family welfare', 'Health', 'Pension information', 'Business registration', 'Rajasthan schemes', 'e-Mitra services', 'Aadhaar-related service information', 'PAN assistance', 'Passport assistance', 'Driving licence assistance'];

/** Fictional sample assistance providers (private document helpers, not government offices). */
const AGENTS = [
  { id: 'ag-1', name: 'Seva Kendra Desk (Demo)', service: 'e-Mitra services, certificates, bill payments', localityId: 'azad-nagar', fee: 'Government fee + service charge as displayed at kiosk', documents: 'Depends on service — Jan Aadhaar, Aadhaar commonly needed', verified: 'verified' as const },
  { id: 'ag-2', name: 'Digital Sahayata Point (Demo)', service: 'PAN, passport form filling, online applications', localityId: 'bhopalganj', fee: '₹50–₹150 assistance fee (sample, set by provider)', documents: 'Aadhaar, photo, address proof', verified: 'unverified' as const },
  { id: 'ag-3', name: 'Kisan Suvidha Help Desk (Demo)', service: 'PM-KISAN e-KYC help, crop insurance forms', localityId: 'pur', fee: 'Assistance fee as displayed (sample)', documents: 'Aadhaar, land records, bank passbook', verified: 'unverified' as const },
  { id: 'ag-4', name: 'Licence & Vahan Help (Demo)', service: 'Learner licence slot booking, form help', localityId: 'subhash-nagar', fee: '₹100 assistance (sample) + official fees', documents: 'Age & address proof', verified: 'verified' as const }
];

export function GovernmentPage() {
  useDocumentTitle('Government & e-Mitra');
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'schemes' | 'agents') ?? 'schemes';
  const schemes = useDB((s) => s.schemes);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [level, setLevel] = useState('');
  const list = schemes.filter((s) => (!cat || s.category === cat) && (!level || s.level === level) && (!q || `${s.name} ${s.description} ${s.department}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="grid gap-5">
      <PageHeader title="Government schemes & citizen services" subtitle="Find schemes, check likely eligibility and get to the official portal." actions={<LinkButton to="/government/eligibility" icon={<ListChecks className="size-4" aria-hidden />}>Check eligibility</LinkButton>} />
      <Notice tone="info" title="One Bhilwara is not a government authority">We summarise public information and link to official portals. Always confirm details, fees and deadlines on the official website or at an authorised centre.</Notice>
      <Tabs label="Government" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={[{ id: 'schemes', label: 'Schemes & services', count: schemes.length }, { id: 'agents', label: 'e-Mitra & document help' }]} />
      {tab === 'schemes' ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <input aria-label="Search schemes" type="search" className="input" placeholder="Search schemes" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Category" className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <select aria-label="Level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">Central & Rajasthan</option><option value="central">Central government</option><option value="rajasthan">Rajasthan</option></select>
          </div>
          {list.length === 0 ? <EmptyState title="No schemes match" action={<Button variant="secondary" onClick={() => { setQ(''); setCat(''); setLevel(''); }}>Reset</Button>} /> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {list.map((s) => (
                <li key={s.id}><Link to={`/government/schemes/${s.id}`} className="card flex h-full gap-3 p-4 hover:border-brand/30">
                  <Landmark className="size-6 shrink-0 text-navy" aria-hidden />
                  <span><span className="block font-bold">{s.name}</span><span className="block text-sm text-muted">{s.level === 'central' ? 'Central' : 'Rajasthan'} · {s.category}</span><span className="mt-1 block line-clamp-2 text-sm">{s.description}</span></span>
                </Link></li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Private assistance providers who help with forms and documents. They are not government offices. Fees shown are indicative samples set by each provider.</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {AGENTS.map((a) => (
              <li key={a.id} className="card grid gap-2 p-4">
                <div className="flex flex-wrap gap-1.5"><VerificationBadge status={a.verified} /><DemoBadge label="Demo provider" /></div>
                <p className="font-bold">{a.name}</p>
                <p className="text-sm">{a.service}</p>
                <p className="text-sm text-muted">{localityName(a.localityId)} · Fee: {a.fee}</p>
                <p className="text-sm text-muted">Documents: {a.documents}</p>
                <EnquiryButton targetType="agent" targetId={a.id} targetName={a.name} variant="secondary" purpose="So the provider can tell you the documents and fee for your request." />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function SchemePage() {
  const { id = '' } = useParams();
  const s = useDB((x) => x.schemes.find((y) => y.id === id));
  useDocumentTitle(s?.name ?? 'Scheme');
  if (!s) return <NotFound />;
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/government" className="hover:underline">Government</Link> / {s.category}</nav>
      <header className="card grid gap-2 p-5">
        <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{s.level === 'central' ? 'Central government' : 'Government of Rajasthan'}</Badge><Badge>{s.category}</Badge></div>
        <h1 className="text-2xl font-extrabold text-navy">{s.name}</h1>
        <p className="text-sm text-muted">Responsible: {s.department}</p>
        <p>{s.description}</p>
        <div className="flex flex-wrap gap-2">
          <a href={s.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 font-semibold text-white">Official portal <ExternalLink className="size-4" aria-hidden /></a>
          <LinkButton variant="secondary" to="/government/eligibility">Check eligibility</LinkButton>
          <SaveButton type="scheme" id={s.id} /><ShareButton title={s.name} />
        </div>
      </header>
      <SectionCard title="Who it’s for"><p>{s.beneficiaries}</p></SectionCard>
      <SectionCard title="Eligibility (summary)"><ul className="list-disc pl-5">{s.eligibility.map((e) => <li key={e}>{e}</li>)}</ul></SectionCard>
      <SectionCard title="Benefits"><ul className="list-disc pl-5">{s.benefits.map((e) => <li key={e}>{e}</li>)}</ul></SectionCard>
      <SectionCard title="Documents usually needed"><ul className="list-disc pl-5">{s.documents.map((e) => <li key={e}>{e}</li>)}</ul></SectionCard>
      <SectionCard title="How to apply"><ol className="list-decimal pl-5">{s.steps.map((e) => <li key={e}>{e}</li>)}</ol></SectionCard>
      <Notice tone="demo" title="Source & verification">
        Source: {s.source} — <a className="underline" href={s.officialUrl} target="_blank" rel="noopener noreferrer">{new URL(s.officialUrl).hostname}</a>. {s.lastVerified ? `Last verified ${formatDate(s.lastVerified)}.` : 'This summary has not yet been verified by One Bhilwara staff; rules change — confirm on the official portal.'}
      </Notice>
    </div>
  );
}

export function EligibilityPage() {
  useDocumentTitle('Eligibility assistant');
  const schemes = useDB((s) => s.schemes);
  const [a, setA] = useState<EligibilityAnswers & { incomeStr: string; ageStr: string }>({ incomeStr: '', ageStr: '', rajasthanResident: true });
  const [done, setDone] = useState(false);
  const results = useMemo<EligibilityResult[]>(() => {
    const answers: EligibilityAnswers = { ...a, age: a.ageStr ? Number(a.ageStr) : undefined, annualIncome: a.incomeStr ? Number(a.incomeStr) : undefined };
    return schemes.map((s) => assess(s, answers)).filter((r) => r.status !== 'info').sort((x, y) => (x.status === 'possible' ? -1 : 1) - (y.status === 'possible' ? -1 : 1) || y.matched.length - x.matched.length);
  }, [a, schemes]);
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <PageHeader title="Eligibility assistant" subtitle="Answer a few questions to see which schemes may be relevant. We only ask what’s needed." />
      <Notice tone="warning" title="Informational only">This compares your answers with simplified criteria. It is not an official assessment and does not guarantee approval. Your answers stay on this device and are not saved.</Notice>
      <form className="card grid gap-4 p-4" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Your age" inputMode="numeric" value={a.ageStr} onChange={(e) => setA({ ...a, ageStr: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
          <Select label="Main occupation" value={a.occupation ?? ''} placeholder="Choose" onChange={(e) => setA({ ...a, occupation: (e.target.value || undefined) as EligibilityAnswers['occupation'] })}
            options={[{ value: 'farmer', label: 'Farmer' }, { value: 'student', label: 'Student' }, { value: 'business', label: 'Business owner / self-employed' }, { value: 'salaried', label: 'Salaried' }, { value: 'worker', label: 'Daily-wage / unorganised worker' }, { value: 'homemaker', label: 'Homemaker' }, { value: 'retired', label: 'Retired' }]} />
          <TextField label="Annual family income (₹)" inputMode="numeric" value={a.incomeStr} onChange={(e) => setA({ ...a, incomeStr: e.target.value.replace(/\D/g, '') })} hint={a.incomeStr ? formatINR(Number(a.incomeStr)) : 'Approximate is fine'} />
        </div>
        <Checkbox checked={!!a.rajasthanResident} onChange={(v) => setA({ ...a, rajasthanResident: v })} label="I am a resident of Rajasthan" />
        {a.occupation === 'farmer' && <Checkbox checked={!!a.landOwner} onChange={(v) => setA({ ...a, landOwner: v })} label="My family holds cultivable land in its name" />}
        <Checkbox checked={!!a.daughterUnder10} onChange={(v) => setA({ ...a, daughterUnder10: v })} label="I have a daughter under 10 years" />
        <div className="flex gap-2"><Button type="submit">See results</Button><Button variant="ghost" onClick={() => { setA({ incomeStr: '', ageStr: '', rajasthanResident: true }); setDone(false); }}>Start over</Button></div>
      </form>
      {done && (
        <section className="grid gap-3" aria-live="polite">
          <h2 className="text-lg font-bold text-navy">Results</h2>
          {results.map((r) => (
            <article key={r.scheme.id} className="card grid gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to={`/government/schemes/${r.scheme.id}`} className="font-bold text-navy">{r.scheme.name}</Link>
                {r.status === 'possible' ? <Badge tone="teal" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>Possibly eligible</Badge> : <Badge tone="gray" icon={<XCircle className="size-3.5" aria-hidden />}>Probably not eligible</Badge>}
              </div>
              {r.matched.length > 0 && <p className="text-sm"><b>Criteria matched:</b> {r.matched.join('; ')}</p>}
              {r.failed.length > 0 && <p className="text-sm"><b>Not matched:</b> {r.failed.join('; ')}</p>}
              <p className="text-sm text-muted"><CircleHelp className="mr-1 inline size-4" aria-hidden /><b>Not confirmed:</b> {r.notConfirmed.join('; ')}</p>
              <p className="text-sm"><FileCheck2 className="mr-1 inline size-4" aria-hidden /><b>Documents:</b> {r.scheme.documents.join(', ')}</p>
              <a href={r.scheme.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand underline">Official next step <ExternalLink className="size-3.5" aria-hidden /></a>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
