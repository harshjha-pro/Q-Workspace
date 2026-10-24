import { useState } from 'react';
import { ArrowRight, Bus, CheckCircle2, ExternalLink, Package, Search, TrainFront, Truck } from 'lucide-react';
import type { Booking, Shipment } from '@/types/models';
import { useDB, useDocumentTitle, useSession } from '@/hooks/useStore';
import { notify } from '@/services/domain/common';
import { repo } from '@/services/store';
import { BusinessCard } from '@/components/cards';
import { EnquiryButton, SectionCard, useRequireAuth } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, LinkButton, Notice, PageHeader, StatusPill } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { Select, TextField } from '@/components/ui/form';
import { formatDate, formatDateTime, formatINR } from '@/utils/format';
import { demoRef, nowIso, uid } from '@/utils/ids';

type Tab = 'bus' | 'train' | 'local' | 'courier';
const CITIES = ['Bhilwara', 'Jaipur', 'Ajmer', 'Udaipur', 'Chittorgarh', 'Kota', 'Delhi', 'Ahmedabad', 'Mumbai', 'Indore'];

interface Result { id: string; operator: string; dep: string; arr: string; duration: string; fare: number; seats: string; klass: string }

/** Deterministic, clearly-labelled demo results. Real schedules/fares need an authorised API. */
function demoResults(mode: 'bus' | 'train', from: string, to: string): Result[] {
  const seed = [...(from + to)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const ops = mode === 'bus' ? ['Sample Roadways (Demo)', 'Sample Travels AC Sleeper (Demo)', 'Sample Express Seater (Demo)'] : ['Sample Express 1XXXX (Demo)', 'Sample Intercity 2XXXX (Demo)'];
  return ops.map((op, i) => {
    const h = (6 + ((seed + i * 5) % 14));
    const dur = 3 + ((seed + i) % 6);
    return { id: `${mode}-${i}`, operator: op, dep: `${String(h).padStart(2, '0')}:${i ? '30' : '00'}`, arr: `${String((h + dur) % 24).padStart(2, '0')}:${i ? '45' : '15'}`, duration: `${dur}h`, fare: (mode === 'bus' ? 250 : 180) + ((seed + i * 37) % 400), seats: mode === 'bus' ? `${8 + ((seed + i) % 20)} seats (demo)` : 'Availability not shown in demo', klass: mode === 'bus' ? (i === 1 ? 'AC Sleeper' : 'Seater') : (i ? 'Chair car' : 'Sleeper') };
  });
}

const SAMPLE_SHIPMENTS: Shipment[] = [
  { id: 'sh-1', trackingNo: 'DEMO-TRK-1001', from: 'Bhilwara', to: 'Jaipur', packageType: 'Documents', status: 'In transit', history: [{ status: 'Booked', at: new Date(Date.now() - 50 * 3600_000).toISOString() }, { status: 'Picked up', at: new Date(Date.now() - 40 * 3600_000).toISOString() }, { status: 'In transit', at: new Date(Date.now() - 20 * 3600_000).toISOString() }], demo: true },
  { id: 'sh-2', trackingNo: 'DEMO-TRK-1002', from: 'Bhilwara', to: 'Ahmedabad', packageType: 'Fabric samples', status: 'Delivered', history: [{ status: 'Booked', at: new Date(Date.now() - 120 * 3600_000).toISOString() }, { status: 'Delivered', at: new Date(Date.now() - 30 * 3600_000).toISOString() }], demo: true }
];

export function TransportPage() {
  useDocumentTitle('Travel & transport');
  const [tab, setTab] = useState<Tab>('bus');
  return (
    <div className="grid gap-5">
      <PageHeader title="Travel, courier & transport" subtitle="Bus and train search, local taxis and parcel services." />
      <Tabs label="Transport" value={tab} onChange={setTab} tabs={[{ id: 'bus', label: 'Bus' }, { id: 'train', label: 'Train' }, { id: 'local', label: 'Taxis & local transport' }, { id: 'courier', label: 'Courier & parcels' }]} />
      {(tab === 'bus' || tab === 'train') && <TripSearch key={tab} mode={tab} />}
      {tab === 'local' && <LocalTransport />}
      {tab === 'courier' && <Courier />}
    </div>
  );
}

function TripSearch({ mode }: { mode: 'bus' | 'train' }) {
  const { userId } = useSession();
  const guard = useRequireAuth();
  const { toast } = useUI();
  const [f, setF] = useState({ from: 'Bhilwara', to: 'Jaipur', date: new Date().toISOString().slice(0, 10), pax: '1' });
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<Result | null>(null);
  const [done, setDone] = useState<Booking | null>(null);
  const [err, setErr] = useState('');
  const search = () => {
    if (f.from === f.to) { setErr('Origin and destination must be different.'); return; }
    if (f.date < new Date().toISOString().slice(0, 10)) { setErr('Choose today or a future date.'); return; }
    setErr(''); setLoading(true); setResults(null);
    setTimeout(() => { setResults(demoResults(mode, f.from, f.to)); setLoading(false); }, 600);
  };
  const pax = Number(f.pax) || 1;
  return (
    <div className="grid gap-4">
      <Notice tone="demo" title={`Demo ${mode} search`}>Results are generated sample data. Real schedules, seat availability and ticket issuance need an authorised booking API or operator partnership. Book real tickets on {mode === 'bus' ? 'the RSRTC portal' : 'IRCTC'}.</Notice>
      <form className="card grid gap-3 p-4 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <Select label="From" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} options={CITIES} />
        <Select label="To" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} options={CITIES} />
        <TextField label="Date" type="date" value={f.date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <Select label="Passengers" value={f.pax} onChange={(e) => setF({ ...f, pax: e.target.value })} options={['1', '2', '3', '4', '5', '6']} />
        <div className="flex items-end"><Button type="submit" block loading={loading} icon={<Search className="size-4" aria-hidden />}>Search</Button></div>
        {err && <p className="text-sm font-medium text-danger sm:col-span-5" role="alert">{err}</p>}
      </form>
      {results && (
        <ul className="grid gap-3" aria-live="polite">
          {results.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-4 p-4">
              {mode === 'bus' ? <Bus className="size-7 text-navy" aria-hidden /> : <TrainFront className="size-7 text-navy" aria-hidden />}
              <span className="min-w-0 flex-1"><span className="block font-bold">{r.operator}</span><span className="text-sm text-muted">{r.klass} · {r.seats}</span></span>
              <span className="text-center"><span className="block text-lg font-bold">{r.dep} <ArrowRight className="inline size-4" aria-hidden /> {r.arr}</span><span className="text-xs text-muted">{r.duration} · {f.from} → {f.to}</span></span>
              <span className="text-right"><span className="block text-lg font-bold text-navy">{formatINR(r.fare)}</span><span className="text-xs text-muted">per person (sample)</span></span>
              <Button onClick={() => guard(() => { setPick(r); setDone(null); })}>Select</Button>
            </li>
          ))}
        </ul>
      )}
      <a href={mode === 'bus' ? 'https://rsrtconline.rajasthan.gov.in/' : 'https://www.irctc.co.in/'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-teal underline">Book real tickets on the official site <ExternalLink className="size-3.5" aria-hidden /></a>
      <Dialog open={!!pick} onClose={() => setPick(null)} title={done ? 'Demo booking saved' : 'Booking summary'}
        footer={done ? <Button onClick={() => setPick(null)}>Close</Button> : <><Button variant="secondary" onClick={() => setPick(null)}>Cancel</Button><Button onClick={() => {
          const b: Booking = { id: uid('bk'), kind: mode, refId: pick!.id, title: `${pick!.operator}: ${f.from} → ${f.to}`, userId: userId!, reference: demoRef(), lines: [{ label: `${pick!.klass} seat`, qty: pax, price: pick!.fare }], total: pick!.fare * pax, attendees: [], status: 'demo_confirmed', date: f.date, meta: { departure: pick!.dep }, createdAt: nowIso(), demo: true };
          repo.insert('bookings', b); notify(userId!, 'booking', 'Demo trip saved', `${b.title} · ${b.reference}`, '/profile?tab=bookings'); setDone(b); toast('Demo booking saved — no ticket issued');
        }}>Confirm demo booking</Button></>}>
        {pick && !done && (
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between"><dt>Operator</dt><dd>{pick.operator}</dd></div>
            <div className="flex justify-between"><dt>Journey</dt><dd>{f.from} → {f.to}</dd></div>
            <div className="flex justify-between"><dt>Date & time</dt><dd>{formatDate(f.date)} · {pick.dep}</dd></div>
            <div className="flex justify-between"><dt>Passengers</dt><dd>{pax}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Total (sample fare)</dt><dd>{formatINR(pick.fare * pax)}</dd></div>
            <p className="mt-2 text-xs text-muted">This saves a demo reference only. It is NOT a ticket and no payment is taken.</p>
          </dl>
        )}
        {done && <div className="grid justify-items-center gap-2 text-center"><CheckCircle2 className="size-10 text-teal" aria-hidden /><p className="font-mono text-lg font-bold text-amber-700">{done.reference}</p><p className="text-sm text-muted">Demo reference — not a valid ticket.</p></div>}
      </Dialog>
    </div>
  );
}

function LocalTransport() {
  const providers = useDB((s) => s.businesses.filter((b) => b.category === 'Transport'));
  const movers = useDB((s) => s.providers.filter((p) => ['movers', 'delivery'].includes(p.category)));
  return (
    <div className="grid gap-5">
      <SectionCard title="Important transport contacts">
        <ul className="grid gap-2 text-sm">
          <li className="flex justify-between"><span>Railway enquiry & help</span><a className="font-semibold text-teal" href="tel:139">139</a></li>
          <li className="flex justify-between"><span>National Highway emergency</span><a className="font-semibold text-teal" href="tel:1033">1033</a></li>
          <li className="flex justify-between"><span>Rajasthan Roadways (RSRTC)</span><a className="font-semibold text-teal" href="https://rsrtconline.rajasthan.gov.in/" target="_blank" rel="noopener noreferrer">Official site ↗</a></li>
        </ul>
      </SectionCard>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Taxi & vehicle providers</h2>{providers.length ? <div className="grid gap-3 md:grid-cols-2">{providers.map((b) => <div key={b.id} className="grid gap-2"><BusinessCard b={b} /><EnquiryButton targetType="transport" targetId={b.id} targetName={b.name} label="Travel enquiry" variant="secondary" /></div>)}</div> : <EmptyState title="No providers listed" />}</section>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Movers & delivery helpers</h2><ul className="grid gap-2">{movers.map((m) => <li key={m.id}><LinkButton variant="secondary" to={`/service-providers/${m.id}`}>{m.name}</LinkButton></li>)}</ul></section>
    </div>
  );
}

function Courier() {
  const couriers = useDB((s) => s.businesses.filter((b) => b.category === 'Courier'));
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Shipment | null | undefined>(undefined);
  const [pickup, setPickup] = useState({ to: '', packageType: 'Documents', date: '', weight: '' });
  const [err, setErr] = useState('');
  const { toast } = useUI();
  const guard = useRequireAuth();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card grid content-start gap-3 p-4">
        <h2 className="flex items-center gap-2 font-bold text-navy"><Package className="size-5" aria-hidden />Track a shipment</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setFound(SAMPLE_SHIPMENTS.find((s) => s.trackingNo.toLowerCase() === q.trim().toLowerCase()) ?? null); }}>
          <label htmlFor="trk" className="sr-only">Tracking number</label>
          <input id="trk" className="input" placeholder="e.g. DEMO-TRK-1001" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit">Track</Button>
        </form>
        <p className="text-xs text-muted">Demo mode recognises sample numbers DEMO-TRK-1001 and DEMO-TRK-1002 only. Real tracking needs courier partner APIs.</p>
        {found === null && <Notice tone="warning">No shipment found for that number.</Notice>}
        {found && (
          <div className="rounded-lg border border-line p-3">
            <div className="flex items-center justify-between"><p className="font-semibold">{found.trackingNo}</p><StatusPill status={found.status === 'Delivered' ? 'completed' : 'in transit'} /></div>
            <p className="text-sm text-muted">{found.from} → {found.to} · {found.packageType} <DemoBadge label="Sample" /></p>
            <ol className="mt-2 border-l-2 border-line pl-3 text-sm">{found.history.map((h, i) => <li key={i}>{h.status} · <span className="text-muted">{formatDateTime(h.at)}</span></li>)}</ol>
          </div>
        )}
      </section>
      <form className="card grid content-start gap-3 p-4" onSubmit={(e) => { e.preventDefault(); guard(() => {
        if (!pickup.to.trim() || !pickup.date) { setErr('Destination and pickup date are required.'); return; }
        setErr(''); toast('Pickup & quote request saved (demo). No courier has been booked.'); setPickup({ to: '', packageType: 'Documents', date: '', weight: '' });
      }); }}>
        <h2 className="flex items-center gap-2 font-bold text-navy"><Truck className="size-5" aria-hidden />Parcel pickup & quote request</h2>
        <TextField label="Destination city / PIN" value={pickup.to} onChange={(e) => setPickup({ ...pickup, to: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Package type" value={pickup.packageType} onChange={(e) => setPickup({ ...pickup, packageType: e.target.value })} options={['Documents', 'Small parcel', 'Fabric samples', 'Large box', 'Fragile']} />
          <TextField label="Approx. weight (kg)" inputMode="decimal" value={pickup.weight} onChange={(e) => setPickup({ ...pickup, weight: e.target.value.replace(/[^\d.]/g, '') })} />
        </div>
        <TextField label="Preferred pickup date" type="date" value={pickup.date} onChange={(e) => setPickup({ ...pickup, date: e.target.value })} />
        {err && <p className="text-sm font-medium text-danger" role="alert">{err}</p>}
        <Button type="submit">Request quote</Button>
        <div className="border-t border-line pt-3"><p className="mb-2 text-sm font-semibold">Local courier directory</p>{couriers.map((c) => <div key={c.id} className="flex items-center justify-between gap-2 py-1 text-sm"><span>{c.name} <Badge>{c.verification === 'verified' ? 'Verified' : 'Not verified'}</Badge></span><EnquiryButton targetType="courier" targetId={c.id} targetName={c.name} label="Enquire" variant="secondary" /></div>)}</div>
      </form>
    </div>
  );
}
