import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ambulance, HeartPulse, Phone, Stethoscope } from 'lucide-react';
import type { HealthAssistRequest } from '@/types/models';
import { HEALTH_TYPES, localityName } from '@/config/catalog';
import { useDB, useDocumentTitle, useLoading, useSession } from '@/hooks/useStore';
import { repo } from '@/services/store';
import { HealthCard } from '@/components/cards';
import { CallButton, DirectionsButton, EnquiryButton, FilterBar, LOCALITY_OPTIONS, ReportButton, SaveButton, SectionCard, ShareButton, useRequireAuth } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, KeyValue, LinkButton, Notice, PageHeader, SkeletonList, StatusPill, VerificationBadge } from '@/components/ui/primitives';
import { useUI } from '@/components/ui/overlay';
import { RadioCards, Select } from '@/components/ui/form';
import { formatDateTime } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';
import NotFound from '@/app/NotFound';

function EmergencyBanner() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger p-4 text-white" role="region" aria-label="Emergency">
      <Ambulance className="size-8 shrink-0" aria-hidden />
      <p className="flex-1 font-semibold">Medical emergency? Don’t wait — call now.</p>
      <a href="tel:108" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 font-bold text-danger"><Phone className="size-4" aria-hidden />108 Ambulance</a>
      <a href="tel:112" className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-white px-4 font-bold">112</a>
    </div>
  );
}

export function HealthcarePage() {
  useDocumentTitle('Healthcare');
  const loading = useLoading();
  const all = useDB((s) => s.healthcare);
  const init = () => ({ q: '', values: { type: '', locality: '' } as Record<string, string>, sort: 'name', verified: false, emergency: false });
  const [f, setF] = useState(init);
  const list = useMemo(() => {
    let l = all.filter((h) => (!f.values.type || h.type === f.values.type) && (!f.values.locality || h.localityId === f.values.locality) && (!f.verified || h.verification === 'verified') && (!f.emergency || h.emergency24x7));
    if (f.q) l = l.filter((h) => `${h.name} ${h.specialty} ${h.services.join(' ')}`.toLowerCase().includes(f.q.toLowerCase()));
    return [...l].sort((a, b) => a.name.localeCompare(b.name));
  }, [all, f]);
  return (
    <div className="grid gap-5">
      <EmergencyBanner />
      <PageHeader title="Healthcare" subtitle="Hospitals, clinics, doctors, diagnostics, pharmacies and more." actions={<LinkButton variant="secondary" to="/healthcare/assist" icon={<Stethoscope className="size-4" aria-hidden />}>Help me find care</LinkButton>} />
      <FilterBar q={f.q} onQ={(q) => setF({ ...f, q })} placeholder="Specialty, service or name" count={list.length}
        filters={[{ key: 'type', label: 'Type', options: HEALTH_TYPES }, { key: 'locality', label: 'Locality', options: LOCALITY_OPTIONS }]} values={f.values} onChange={(k, v) => setF({ ...f, values: { ...f.values, [k]: v } })}
        toggles={[{ key: 'v', label: 'Verified only', on: f.verified, set: (v) => setF({ ...f, verified: v }) }, { key: 'e', label: 'Emergency department (as listed)', on: f.emergency, set: (v) => setF({ ...f, emergency: v }) }]} onReset={() => setF(init())} />
      {loading ? <SkeletonList /> : list.length === 0 ? <EmptyState icon={<HeartPulse className="size-6" aria-hidden />} title="No providers match" /> : <div className="grid gap-3 md:grid-cols-2">{list.map((h) => <HealthCard key={h.id} h={h} />)}</div>}
      <p className="text-xs text-muted">Listings are informational. Timings, availability and capacity are not live — always confirm directly with the provider.</p>
    </div>
  );
}

export function HealthProviderPage() {
  const { id = '' } = useParams();
  const h = useDB((s) => s.healthcare.find((x) => x.id === id));
  useDocumentTitle(h?.name ?? 'Healthcare');
  if (!h) return <NotFound />;
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/healthcare" className="hover:underline">Healthcare</Link> / {h.type}</nav>
      <header className="card grid gap-3 p-5">
        <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{h.type}</Badge><VerificationBadge status={h.verification} />{h.demo && <DemoBadge label="Demo record" />}</div>
        <h1 className="text-2xl font-extrabold text-navy">{h.name}</h1>
        <KeyValue items={[['Specialty', h.specialty], ['Address', h.address], ['Locality', localityName(h.localityId)], ['Hours', h.hours ? `${h.hours}${h.hoursVerified ? '' : ' — not verified'}` : 'Not supplied'], ['Source', h.source]]} />
        <div className="flex flex-wrap gap-2">
          <EnquiryButton targetType="healthcare" targetId={h.id} targetName={h.name} label="Appointment enquiry" purpose="So the provider can respond about appointment timing. Don’t include medical details." />
          <CallButton phone={h.phone} name={h.name} /><DirectionsButton query={`${h.name.replace(' (Demo)', '')} Bhilwara`} /><SaveButton type="healthcare" id={h.id} /><ShareButton title={h.name} /><ReportButton targetType="healthcare" targetId={h.id} title={h.name} label="Report incorrect info" />
        </div>
      </header>
      <SectionCard title="Services"><div className="flex flex-wrap gap-2">{h.services.map((s) => <Badge key={s} tone="navy">{s}</Badge>)}</div></SectionCard>
      <Notice tone="warning">Availability, beds and appointments are not shown live. Please call the provider. For emergencies call 108 or 112.</Notice>
    </div>
  );
}

const SERVICE_TYPES = ['General physician', 'Child specialist', 'Women’s health', 'Diagnostics / lab test', 'Physiotherapy', 'Hospital admission enquiry', 'Pharmacy / medicine availability', 'Other'];

export function HealthAssistPage() {
  useDocumentTitle('Find care — assistance');
  const { userId, prefs } = useSession();
  const mine = useDB((s) => s.healthAssist.filter((h) => h.userId === userId));
  const providers = useDB((s) => s.healthcare);
  const guard = useRequireAuth();
  const { toast } = useUI();
  const [f, setF] = useState({ serviceType: SERVICE_TYPES[0], localityId: prefs.localityId === 'all' ? 'shastri-nagar' : prefs.localityId, urgency: 'routine' as HealthAssistRequest['urgency'], contactPref: 'in_app' as HealthAssistRequest['contactPref'] });
  return (
    <div className="grid gap-5">
      <EmergencyBanner />
      <PageHeader title="Help me find care" subtitle="A coordinator helps you find a suitable hospital, clinic or service and appointment information." badge={<DemoBadge label="Demo service" />} />
      <Notice tone="info" title="Privacy">We only ask for the type of service — not your symptoms or medical records. We never create prescriptions, reports or certificates.</Notice>
      <div className="grid gap-5 lg:grid-cols-2">
        <form className="card grid gap-4 p-4" onSubmit={(e) => {
          e.preventDefault();
          guard(() => {
            if (f.urgency === 'urgent') toast('If this is an emergency, call 108 or 112 now.', 'error');
            const r: HealthAssistRequest = { id: uid('ha'), userId: userId!, ...f, status: 'received', history: [{ status: 'received', at: nowIso() }], createdAt: nowIso(), demo: true };
            repo.insert('healthAssist', r);
            setTimeout(() => repo.at('healthAssist').mutate(r.id, (c) => ({ status: 'options_shared', history: [...c.history, { status: 'options_shared', at: nowIso(), note: 'Simulated: demo options shared below. Confirm directly with providers.' }] })), 2000);
            toast('Request received (demo)');
          });
        }}>
          <Select label="Type of service needed" value={f.serviceType} onChange={(e) => setF({ ...f, serviceType: e.target.value })} options={SERVICE_TYPES} />
          <Select label="Preferred locality" value={f.localityId} onChange={(e) => setF({ ...f, localityId: e.target.value })} options={LOCALITY_OPTIONS} />
          <RadioCards label="How soon?" value={f.urgency} onChange={(urgency) => setF({ ...f, urgency })} options={[{ value: 'routine', label: 'Routine' }, { value: 'soon', label: 'In a day or two' }, { value: 'urgent', label: 'Today', description: 'Emergency? Call 108' }]} />
          <Select label="Contact preference" value={f.contactPref} onChange={(e) => setF({ ...f, contactPref: e.target.value as HealthAssistRequest['contactPref'] })} options={[{ value: 'in_app', label: 'In-app message' }, { value: 'call', label: 'Phone call' }, { value: 'whatsapp', label: 'WhatsApp' }]} />
          <Button type="submit">Request assistance</Button>
          <p className="text-xs text-muted">Administrative help only: finding appointment information and directing you to the right provider.</p>
        </form>
        <section className="grid content-start gap-3">
          <h2 className="font-bold text-navy">Your requests</h2>
          {mine.length === 0 ? <EmptyState title="No requests yet" /> : mine.map((r) => (
            <article key={r.id} className="card grid gap-2 p-4">
              <div className="flex justify-between gap-2"><p className="font-semibold">{r.serviceType}</p><StatusPill status={r.status} /></div>
              <p className="text-sm text-muted">{localityName(r.localityId)} · {r.urgency} · {formatDateTime(r.createdAt)}</p>
              {r.status === 'options_shared' && (
                <div className="rounded-lg bg-page p-3 text-sm">
                  <p className="font-semibold">Options to contact (demo)</p>
                  <ul className="list-disc pl-5">{providers.filter((p) => p.localityId === r.localityId || p.type === 'Hospital').slice(0, 3).map((p) => <li key={p.id}><Link className="text-navy underline" to={`/healthcare/${p.id}`}>{p.name}</Link></li>)}</ul>
                  <p className="mt-1 text-xs text-muted">Demo availability is not live. Confirm directly with the provider before visiting.</p>
                </div>
              )}
              <ol className="border-l-2 border-line pl-3 text-xs text-muted">{r.history.map((h, i) => <li key={i}>{h.status.replace(/_/g, ' ')} · {formatDateTime(h.at)}{h.note ? ` — ${h.note}` : ''}</li>)}</ol>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
