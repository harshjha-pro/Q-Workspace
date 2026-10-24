import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BellRing, Bug, CalendarDays, CloudSun, Droplets, Leaf, Sprout, Stethoscope, Sun, Wheat } from 'lucide-react';
import { mandi } from '@/data/seed/content';
import { useDB, useDocumentTitle, useLang } from '@/hooks/useStore';
import { ArticleCard, ProviderCard } from '@/components/cards';
import { Sparkline } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, LinkButton, Notice, PageHeader } from '@/components/ui/primitives';
import { Tabs, useUI } from '@/components/ui/overlay';
import { FilePicker, Select, TextArea, TextField } from '@/components/ui/form';
import { formatDate, formatINR } from '@/utils/format';
import { safeStorage } from '@/utils/storage';

type Tab = 'mandi' | 'doctor' | 'garden' | 'info';

export function AgriculturePage() {
  useDocumentTitle('Agriculture');
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'mandi';
  return (
    <div className="grid gap-5">
      <PageHeader title="Farming & agriculture" subtitle="Mandi prices, crop help, garden care and farmer schemes." />
      <Tabs label="Agriculture" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={[{ id: 'mandi', label: 'Mandi prices' }, { id: 'doctor', label: 'AI crop doctor' }, { id: 'garden', label: 'Garden & plant care' }, { id: 'info', label: 'Schemes & resources' }]} />
      {tab === 'mandi' && <Mandi initialCrop={params.get('crop') ?? ''} />}
      {tab === 'doctor' && <CropDoctor />}
      {tab === 'garden' && <Garden />}
      {tab === 'info' && <FarmerInfo />}
    </div>
  );
}

function Mandi({ initialCrop }: { initialCrop: string }) {
  const lang = useLang();
  const all = mandi();
  const [crop, setCrop] = useState(initialCrop);
  const [market, setMarket] = useState('');
  const [selected, setSelected] = useState(all.find((m) => m.commodity === initialCrop)?.id ?? all[0].id);
  const markets = Array.from(new Set(all.map((m) => m.market)));
  const list = all.filter((m) => (!crop || m.commodity.toLowerCase().includes(crop.toLowerCase()) || m.commodityHi.includes(crop)) && (!market || m.market === market));
  const sel = all.find((m) => m.id === selected) ?? all[0];
  return (
    <div className="grid gap-4">
      <Notice tone="warning" title="Sample data — not today’s prices">These numbers are illustrative only. Connect a verified source (e.g. Agmarknet / data.gov.in via a server job) before using prices for selling decisions.</Notice>
      <div className="grid gap-2 sm:grid-cols-3">
        <input aria-label="Search crop" type="search" className="input" placeholder="Search crop (e.g. mustard / सरसों)" value={crop} onChange={(e) => setCrop(e.target.value)} />
        <select aria-label="Market" className="input" value={market} onChange={(e) => setMarket(e.target.value)}><option value="">All markets</option>{markets.map((m) => <option key={m}>{m}</option>)}</select>
        <Button variant="ghost" onClick={() => { setCrop(''); setMarket(''); }}>Reset</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card overflow-x-auto">
          {list.length === 0 ? <p className="p-6 text-center text-muted">No crops match.</p> : (
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Mandi prices (sample)</caption>
              <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Crop</th><th className="p-3 font-medium">Market</th><th className="p-3 text-right font-medium">Min</th><th className="p-3 text-right font-medium">Max</th><th className="p-3 text-right font-medium">Modal</th><th className="p-3 font-medium">Date</th></tr></thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className={m.id === selected ? 'bg-navy-50' : 'border-b border-line'}>
                    <td className="p-3"><button type="button" className="font-semibold text-navy underline-offset-2 hover:underline" onClick={() => setSelected(m.id)} aria-pressed={m.id === selected}>{lang === 'hi' ? m.commodityHi : m.commodity}</button></td>
                    <td className="p-3 text-muted">{m.market}</td>
                    <td className="p-3 text-right tabular-nums">{formatINR(m.min)}</td><td className="p-3 text-right tabular-nums">{formatINR(m.max)}</td><td className="p-3 text-right font-semibold tabular-nums">{formatINR(m.modal)}</td>
                    <td className="p-3 text-muted">{formatDate(m.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="p-3 text-xs text-muted">Unit: ₹/quintal · Source: sample data</p>
        </div>
        <section className="card p-4" aria-label="Price history">
          <div className="flex items-center justify-between"><h2 className="font-bold text-navy">{sel.commodity} — 10-day modal</h2><DemoBadge label="Sample" /></div>
          <p className="text-sm text-muted">{sel.market}</p>
          <div className="mt-3"><Sparkline values={sel.history.map((h) => h.modal)} label={`${sel.commodity} sample modal price trend`} width={280} height={80} /></div>
          <div className="mt-1 flex justify-between text-xs text-muted"><span>{formatDate(sel.history[0].date)}</span><span>{formatDate(sel.history[sel.history.length - 1].date)}</span></div>
          <p className="mt-3 text-sm">Range {formatINR(Math.min(...sel.history.map((h) => h.modal)))} – {formatINR(Math.max(...sel.history.map((h) => h.modal)))}</p>
          <p className="mt-2 text-xs text-muted"><b>Modal</b> = the price at which most trades happened that day. Min/Max show the spread.</p>
        </section>
      </div>
    </div>
  );
}

const CROPS = ['Wheat', 'Mustard', 'Maize', 'Gram', 'Soybean', 'Cotton', 'Groundnut', 'Vegetables'];
const STAGES = ['Sowing / germination', 'Vegetative', 'Flowering', 'Fruiting / grain fill', 'Harvest'];

function CropDoctor() {
  const [f, setF] = useState({ crop: 'Mustard', stage: STAGES[1], symptoms: '', location: '', conditions: '' });
  const [photo, setPhoto] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<null | { possible: string[]; steps: string[] }>(null);
  const submit = () => {
    if (f.symptoms.trim().length < 15) { setErr('Describe the symptoms in a little more detail (15+ characters).'); return; }
    setErr(''); setBusy(true); setAnswer(null);
    setTimeout(() => {
      const s = f.symptoms.toLowerCase();
      const possible: string[] = [];
      if (/yellow|pale/.test(s)) possible.push('Nutrient deficiency (often nitrogen) or water stress');
      if (/spot|patch|brown|black/.test(s)) possible.push('A fungal leaf-spot type disease');
      if (/white|powder/.test(s)) possible.push('Powdery mildew–like infection');
      if (/insect|aphid|hole|chewed|eaten/.test(s)) possible.push('Insect pest damage (e.g. aphids or caterpillars)');
      if (/wilt|droop/.test(s)) possible.push('Wilt — root problem, waterlogging or heat stress');
      if (!possible.length) possible.push('Not enough information to suggest a likely cause');
      setAnswer({ possible, steps: ['Check several plants across the field to see how widespread it is.', 'Note when symptoms started and recent weather, irrigation or fertiliser changes.', 'Take clear photos of affected leaves (both sides) and stems.', 'Show the sample to your nearest Krishi Vigyan Kendra or agriculture supervisor before applying any chemical.', 'If a chemical is advised, use only the product and dose a qualified expert recommends for your crop.'] });
      setBusy(false);
    }, 900);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="card grid gap-4 p-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="flex items-center gap-2"><Stethoscope className="size-5 text-teal" aria-hidden /><h2 className="font-bold text-navy">Describe the problem</h2><DemoBadge label="Demo AI" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Crop" value={f.crop} onChange={(e) => setF({ ...f, crop: e.target.value })} options={CROPS} />
          <Select label="Crop stage" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} options={STAGES} />
        </div>
        <TextArea label="Symptoms" required value={f.symptoms} error={err} onChange={(e) => setF({ ...f, symptoms: e.target.value })} placeholder="e.g. Lower leaves turning yellow with brown spots, spreading over a week" />
        <FilePicker label="Plant photo (optional)" value={photo} onChange={setPhoto} multiple={false} hint="Image recognition needs a configured AI service. In demo mode the photo is not analysed." />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Village / area" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <TextField label="Recent conditions" value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} placeholder="e.g. heavy rain, irrigation, fog" />
        </div>
        <Button type="submit" loading={busy}>Get guidance</Button>
      </form>
      <section className="grid content-start gap-3" aria-live="polite">
        {!answer && !busy && <EmptyState icon={<Bug className="size-6" aria-hidden />} title="Your guidance appears here" text="This tool gives general, non-verified guidance. It is not a diagnosis." />}
        {answer && (
          <div className="card grid gap-3 p-4">
            <div className="flex items-center gap-2"><DemoBadge label="Demo response — not a verified diagnosis" /></div>
            <h3 className="font-bold text-navy">Possible causes for {f.crop} ({f.stage.toLowerCase()})</h3>
            <ul className="list-disc pl-5 text-sm">{answer.possible.map((p) => <li key={p}>{p}</li>)}</ul>
            <p className="text-sm text-muted">Confidence: low. Many problems look alike; a field visit is needed to be sure.</p>
            <h3 className="font-bold text-navy">Suggested next steps</h3>
            <ol className="list-decimal pl-5 text-sm">{answer.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <Notice tone="warning">We don’t recommend specific pesticides or doses. Wrong chemicals or doses can harm crops, people and soil.</Notice>
            <LinkButton variant="secondary" to="/services/other?q=agriculture">Consult a local expert</LinkButton>
          </div>
        )}
      </section>
    </div>
  );
}

const PLANTS = [
  { name: 'Tulsi (holy basil)', sun: 'Full sun to partial shade', water: 'Every 1–2 days in summer; let topsoil dry slightly', soil: 'Well-drained loamy soil', feed: 'Compost every 4 weeks', season: 'Plant in spring–monsoon' },
  { name: 'Tomato', sun: '6+ hours sun', water: 'Deep watering every 2–3 days; avoid wetting leaves', soil: 'Rich, well-drained', feed: 'Compost at planting, light feed every 3 weeks', season: 'Sow Jul–Aug or Nov–Dec' },
  { name: 'Money plant', sun: 'Bright indirect light', water: 'When top 2 cm is dry', soil: 'Any potting mix', feed: 'Diluted liquid feed monthly', season: 'Any time indoors' },
  { name: 'Bougainvillea', sun: 'Full sun', water: 'Sparingly once established', soil: 'Well-drained, not too rich', feed: 'Light feed in spring', season: 'Plant before monsoon' },
  { name: 'Coriander', sun: 'Morning sun, afternoon shade in summer', water: 'Keep soil lightly moist', soil: 'Loose, well-drained', feed: 'Not usually needed', season: 'Best Oct–Feb' }
];
interface Reminder { id: string; plant: string; task: string; every: number; next: string }
const RKEY = 'one-bhilwara:garden-reminders';

function Garden() {
  const [plant, setPlant] = useState(PLANTS[0].name);
  const [id, setId] = useState('');
  const [reminders, setReminders] = useState<Reminder[]>(() => { try { return JSON.parse(safeStorage.get(RKEY) ?? '[]') as Reminder[]; } catch { return []; } });
  const [task, setTask] = useState('Water');
  const [every, setEvery] = useState('2');
  const { toast } = useUI();
  const p = PLANTS.find((x) => x.name === plant)!;
  const save = (r: Reminder[]) => { setReminders(r); safeStorage.set(RKEY, JSON.stringify(r)); };
  const month = new Date().toLocaleDateString('en-IN', { month: 'long' });
  const calendar = useMemo(() => PLANTS.map((x) => ({ name: x.name, season: x.season })), []);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card grid gap-3 p-4">
        <h2 className="flex items-center gap-2 font-bold text-navy"><Leaf className="size-5 text-teal" aria-hidden />Plant care guide</h2>
        <Select label="Choose a plant" value={plant} onChange={(e) => setPlant(e.target.value)} options={PLANTS.map((x) => x.name)} />
        <ul className="grid gap-2 text-sm">
          <li className="flex gap-2"><Sun className="size-4 shrink-0 text-amber" aria-hidden /><span><b>Sunlight:</b> {p.sun}</span></li>
          <li className="flex gap-2"><Droplets className="size-4 shrink-0 text-blue-600" aria-hidden /><span><b>Watering:</b> {p.water}</span></li>
          <li className="flex gap-2"><Sprout className="size-4 shrink-0 text-teal" aria-hidden /><span><b>Soil:</b> {p.soil}</span></li>
          <li className="flex gap-2"><Wheat className="size-4 shrink-0 text-amber-700" aria-hidden /><span><b>Fertiliser:</b> {p.feed}</span></li>
          <li className="flex gap-2"><CalendarDays className="size-4 shrink-0 text-navy" aria-hidden /><span><b>Season:</b> {p.season}</span></li>
        </ul>
        <p className="text-xs text-muted">General guidance for hot, dry conditions like Bhilwara’s. Adjust to your pots, soil and shade.</p>
        <div className="rounded-lg bg-page p-3">
          <p className="font-semibold">Plant identification</p>
          <FilePicker label="Upload a plant photo" value={id ? [id] : []} onChange={(n) => { setId(n[0] ?? ''); if (n[0]) toast('Plant identification needs an image-recognition service (not configured). Photo not analysed.', 'info'); }} multiple={false} />
        </div>
      </section>
      <section className="grid content-start gap-4">
        <div className="card p-4">
          <h2 className="flex items-center gap-2 font-bold text-navy"><BellRing className="size-5 text-amber" aria-hidden />Care reminders</h2>
          <form className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2" onSubmit={(e) => { e.preventDefault(); const days = Math.max(1, Number(every) || 1); save([...reminders, { id: Date.now().toString(36), plant, task, every: days, next: new Date(Date.now() + days * 86400_000).toISOString() }]); toast('Reminder added — shown here and in-app'); }}>
            <select aria-label="Task" className="input" value={task} onChange={(e) => setTask(e.target.value)}><option>Water</option><option>Fertilise</option><option>Prune</option><option>Check for pests</option></select>
            <select aria-label="Every" className="input" value={every} onChange={(e) => setEvery(e.target.value)}><option value="1">Daily</option><option value="2">Every 2 days</option><option value="7">Weekly</option><option value="28">Every 4 weeks</option></select>
            <Button type="submit">Add</Button>
          </form>
          <ul className="mt-3 grid gap-2">
            {reminders.length === 0 && <li className="text-sm text-muted">No reminders yet. Reminders are stored on this device; push alerts need notification setup.</li>}
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-line p-2 text-sm">
                <span><b>{r.task}</b> {r.plant} · every {r.every} day{r.every > 1 ? 's' : ''} · next {formatDate(r.next)}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { save(reminders.map((x) => x.id === r.id ? { ...x, next: new Date(Date.now() + x.every * 86400_000).toISOString() } : x)); toast('Marked done'); }}>Done</Button>
                  <Button size="sm" variant="ghost" aria-label="Delete reminder" onClick={() => save(reminders.filter((x) => x.id !== r.id))}>✕</Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="font-bold text-navy">Planting calendar</h2>
          <p className="text-sm text-muted">Now: {month}</p>
          <ul className="mt-2 grid gap-1 text-sm">{calendar.map((c) => <li key={c.name} className="flex justify-between gap-2"><span>{c.name}</span><span className="text-muted">{c.season}</span></li>)}</ul>
        </div>
      </section>
    </div>
  );
}

function FarmerInfo() {
  const schemes = useDB((s) => s.schemes.filter((x) => x.category === 'Farmer schemes'));
  const news = useDB((s) => s.articles.filter((a) => a.category === 'agriculture' && a.status === 'published'));
  const providers = useDB((s) => s.providers.filter((p) => ['labour', 'gardener', 'helper'].includes(p.category)).slice(0, 3));
  return (
    <div className="grid gap-5">
      <section>
        <h2 className="mb-2 text-lg font-bold text-navy">Farmer schemes</h2>
        <div className="grid gap-2 sm:grid-cols-2">{schemes.map((s) => <Link key={s.id} to={`/government/schemes/${s.id}`} className="card p-3 hover:border-navy/30"><p className="font-semibold">{s.name}</p><p className="text-sm text-muted">{s.department}</p></Link>)}</div>
        <p className="mt-2 text-xs text-muted">Always apply via official portals. Source and update dates are shown on each scheme page.</p>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <div className="card p-4"><h2 className="flex items-center gap-2 font-bold text-navy"><CloudSun className="size-5 text-amber" aria-hidden />Weather & advisories</h2><p className="mt-1 text-sm text-muted">Check official district agro-met advisories from IMD and your Krishi Vigyan Kendra. A live advisory feed can be connected later.</p><LinkButton variant="secondary" size="sm" className="mt-2" to="/alerts">City weather alerts</LinkButton></div>
        <div className="card p-4"><h2 className="flex items-center gap-2 font-bold text-navy"><Droplets className="size-5 text-blue-600" aria-hidden />Irrigation resources</h2><p className="mt-1 text-sm text-muted">Drip and sprinkler support is offered under government programmes — check the official agriculture department portal for current terms.</p><Badge className="mt-2">Information only</Badge></div>
      </section>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Agricultural news</h2><div className="grid gap-3">{news.map((a) => <ArticleCard key={a.id} a={a} />)}</div></section>
      <section><h2 className="mb-2 text-lg font-bold text-navy">Local farm-related services</h2><div className="grid gap-3 md:grid-cols-3">{providers.map((p) => <ProviderCard key={p.id} p={p} />)}</div></section>
    </div>
  );
}
