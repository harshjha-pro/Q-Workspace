import { ChevronDown, ChevronRight, Columns2, Info, MapPin, ScanText, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Layout';
import { SearchBar } from '../components/SearchBar';
import { Card, CATEGORY_ICONS, LinkAction, SectionTitle, Tag, cx } from '../components/ui';
import { Sheet } from '../components/Personalise';
import {
  CATEGORIES,
  INGREDIENT_MAP,
  PUBLIC_ARTICLES,
  PUBLIC_INGREDIENTS,
  PUBLIC_TOPICS,
  REGION_MAP,
  REGIONS,
  SEASON_LABEL,
  SUGGESTED_QUESTIONS,
  TOPIC_MAP,
  seasonFor,
  seasonalGuidance,
} from '../data';
import { useStore } from '../lib/store';
import { fetchWeather, weatherEnabled, type Weather } from '../lib/weather';

function HeroArt() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden>
      <path d="M95 112c10-30 30-52 58-66-8 34-28 58-58 66z" fill="#2F6B4A" />
      <path d="M95 112c10-30 30-52 58-66" stroke="#B8D3BE" strokeWidth="1.5" fill="none" />
      <path d="M80 114c-6-34 4-64 30-88 6 36-6 66-30 88z" fill="#245A3D" />
      <path d="M80 114c-6-34 4-64 30-88" stroke="#B8D3BE" strokeWidth="1.5" fill="none" />
      <path d="M70 114C52 92 48 66 58 38c20 26 24 52 12 76z" fill="#3F7F59" />
      <path d="M70 114C52 92 48 66 58 38" stroke="#DCE9DF" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function ContextChip() {
  const { profile, setProfile } = useStore();
  const [open, setOpen] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState(false);
  const region = profile.regionId ? REGION_MAP[profile.regionId] : undefined;
  const season = seasonFor(new Date());

  useEffect(() => {
    if (!region || !weatherEnabled) return;
    const ctrl = new AbortController();
    setWeather(null);
    setWeatherError(false);
    fetchWeather(region, ctrl.signal).then(setWeather).catch(() => !ctrl.signal.aborted && setWeatherError(true));
    return () => ctrl.abort();
  }, [region]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[12.5px] text-ink-soft hover:bg-ivory-100">
        <MapPin size={14} className="text-forest-700" />
        {region ? region.name : 'Set your city'}
        <span className="text-ink-faint">·</span>
        {weather ? <span title={`Live data from ${weather.provider}`}>{Math.round(weather.temperatureC)}°C</span> : <span>{SEASON_LABEL[season]}</span>}
        <ChevronDown size={14} className="text-ink-faint" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Region & seasonal context">
        <p className="mb-3 text-[13px] text-ink-muted">Choosing a city adds broad climate and seasonal context to results. It is stored only on this device.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setProfile({ ...profile, regionId: profile.regionId === r.id ? undefined : r.id })}
              className={cx('min-h-[36px] rounded-full border px-3 text-[13px]', profile.regionId === r.id ? 'border-forest-700 bg-forest-700 text-white' : 'border-line bg-white')}
            >
              {r.name}
            </button>
          ))}
        </div>
        {region && <p className="text-[13px] text-ink-soft">{region.note}</p>}
        <div className="mt-4 rounded-xl border border-line bg-white p-3 text-[12.5px] text-ink-muted">
          {weather ? (
            <>
              Live weather from {weather.provider} at {new Date(weather.observedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}: {Math.round(weather.temperatureC)}°C
              {weather.humidity !== undefined && `, humidity ${weather.humidity}%`}
              {weather.uvIndexMax !== undefined && `, forecast max UV index ${weather.uvIndexMax.toFixed(0)}`}.
            </>
          ) : weatherEnabled ? (
            weatherError ? 'Live weather is unavailable right now. Showing general seasonal guidance only.' : region ? 'Loading live weather…' : 'Pick a city to load live weather.'
          ) : (
            'Live weather is not configured. Seasonal guidance is general for the time of year and region — it is not current weather or UV data.'
          )}
        </div>
      </Sheet>
    </>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { recent, saved, profile, routines } = useStore();
  const region = profile.regionId ? REGION_MAP[profile.regionId] : undefined;
  const season = seasonFor(new Date());
  const guidance = seasonalGuidance(season, region);
  const popularIngredients = ['niacinamide', 'salicylic-acid', 'retinoids', 'vitamin-c', 'fluoride', 'coconut-oil'].map((id) => INGREDIENT_MAP[id]).filter(Boolean);
  // "Recently reviewed" is derived from review dates — no popularity metrics are invented.
  const recentlyReviewed = [...PUBLIC_TOPICS].sort((a, b) => b.lastReviewed.localeCompare(a.lastReviewed)).slice(0, 4);
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dueRoutines = routines.filter((r) => r.reminder && r.reminder <= hhmm && (r.time === 'morning' ? now.getHours() < 12 : r.time === 'evening' ? now.getHours() >= 17 : true));

  return (
    <div className="space-y-7">
      <header className="flex items-start justify-between gap-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <div>
            <h1 className="text-[22px] font-semibold leading-none tracking-tight text-forest-800">CareLens</h1>
            <p className="mt-1 text-[12px] text-ink-muted">Better choices. Healthier you.</p>
          </div>
        </div>
        <Link to="/profile" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-forest-700" aria-label="Profile">
          <Sparkles size={18} />
        </Link>
      </header>
      <div className="hidden lg:block">
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">Understand before you use</h1>
        <p className="mt-1 text-[14px] text-ink-muted">Clear, unbiased information on personal-care products, ingredients and practices — for Indian consumers.</p>
      </div>

      <div className="space-y-3">
        <ContextChip />
        <SearchBar />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {SUGGESTED_QUESTIONS.slice(0, 7).map((q) => (
            <button
              key={q.q}
              type="button"
              onClick={() => navigate(`/search?q=${encodeURIComponent(q.q)}`)}
              className="min-h-[34px] shrink-0 rounded-full border border-line bg-white px-3 text-[12.5px] text-ink-soft hover:border-forest-200 hover:bg-forest-50"
            >
              {q.q}
            </button>
          ))}
        </div>
      </div>

      {dueRoutines.length > 0 && (
        <Link to="/profile/routines" className="flex items-center gap-3 rounded-2xl border border-forest-100 bg-forest-50 px-4 py-3 text-[13.5px] text-forest-800">
          <Info size={16} /> Reminder: {dueRoutines.map((r) => r.name).join(', ')}
          <ChevronRight size={16} className="ml-auto" />
        </Link>
      )}

      <Card className="relative overflow-hidden bg-gradient-to-br from-forest-50 to-white">
        <div className="relative z-10 max-w-[62%] p-5">
          <h2 className="text-[19px] font-semibold leading-tight text-ink">Understand Before You Use</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">Clear, unbiased information on products, ingredients and more — with the evidence level stated every time.</p>
          <Link to="/explore" className="mt-4 inline-flex min-h-[40px] items-center rounded-full bg-forest-700 px-4 text-[13px] font-medium text-white hover:bg-forest-800">
            Explore now
          </Link>
        </div>
        <div className="absolute bottom-0 right-0 top-0 w-[45%]">
          <HeroArt />
        </div>
      </Card>

      <section>
        <SectionTitle action={<LinkAction to="/explore">View all</LinkAction>}>Browse by category</SectionTitle>
        <div className="grid grid-cols-4 gap-2.5">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICONS[c.icon];
            return (
              <Link key={c.id} to={`/category/${c.id}`} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white px-1.5 py-3.5 text-center shadow-card hover:border-forest-200">
                <Icon size={24} className="text-forest-700" strokeWidth={1.6} />
                <span className="text-[11.5px] font-medium leading-tight text-ink-soft">{c.short}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link to="/analyse" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-forest-50 text-forest-700"><ScanText size={20} /></span>
          <span className="flex-1">
            <span className="block text-[14px] font-semibold">Analyse an ingredient list</span>
            <span className="block text-[12.5px] text-ink-muted">Paste a label to see what each ingredient does</span>
          </span>
          <ChevronRight size={18} className="text-ink-faint" />
        </Link>
        <Link to="/compare" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-forest-50 text-forest-700"><Columns2 size={20} /></span>
          <span className="flex-1">
            <span className="block text-[14px] font-semibold">Compare products</span>
            <span className="block text-[12.5px] text-ink-muted">Ingredients, price per ml and what differs</span>
          </span>
          <ChevronRight size={18} className="text-ink-faint" />
        </Link>
      </section>

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-2"><Sun size={16} className="text-forest-700" /> {SEASON_LABEL[season]}{region ? ` · ${region.name}` : ''}</span>
        </SectionTitle>
        <Card className="p-4">
          <p className="text-[14px] font-semibold text-ink">{guidance.title}</p>
          <ul className="mt-2 space-y-1 text-[13.5px] text-ink-soft">
            {guidance.tips.map((t) => <li key={t}>• {t}</li>)}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {guidance.topicIds.map((id) => TOPIC_MAP[id] && (
              <Link key={id} to={`/topic/${id}`} className="rounded-full bg-forest-50 px-3 py-1.5 text-[12.5px] font-medium text-forest-700 hover:bg-forest-100">{TOPIC_MAP[id].name}</Link>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-ink-faint">General seasonal guidance based on IMD seasons{region ? ' and your region' : ''} — not live weather.</p>
        </Card>
      </section>

      <section>
        <SectionTitle action={<LinkAction to="/ingredients">All ingredients</LinkAction>}>Key ingredient explainers</SectionTitle>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
          {popularIngredients.map((i) => (
            <Link key={i.id} to={`/ingredient/${i.id}`} className="w-44 shrink-0 rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200 sm:w-auto">
              <p className="text-[14px] font-semibold text-ink">{i.name}</p>
              <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-muted">{i.kind}</p>
              <p className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-forest-700">5W1H guide <ChevronRight size={14} /></p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle action={<LinkAction to="/learn/faq-basics">FAQ</LinkAction>}>Common questions</SectionTitle>
        <Card className="divide-y divide-line">
          {SUGGESTED_QUESTIONS.slice(7).concat(SUGGESTED_QUESTIONS.slice(0, 2)).map((q) => (
            <Link key={q.q} to={`/search?q=${encodeURIComponent(q.q)}`} className="flex min-h-[48px] items-center gap-3 px-4 text-[13.5px] text-ink-soft hover:bg-ivory-100/60">
              <span className="h-4 w-0.5 rounded bg-forest-500" />
              <span className="flex-1">{q.q}</span>
              <ChevronRight size={16} className="text-ink-faint" />
            </Link>
          ))}
        </Card>
      </section>

      <section>
        <SectionTitle action={<LinkAction to="/learn">Learn</LinkAction>}>Recently reviewed topics</SectionTitle>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {recentlyReviewed.map((t) => (
            <Link key={t.id} to={`/topic/${t.id}`} className="rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200">
              <p className="text-[14px] font-semibold text-ink">{t.name}</p>
              <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-muted">{t.summary}</p>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-faint">Ordered by review date. CareLens does not show popularity numbers it cannot verify.</p>
      </section>

      {(recent.length > 0 || saved.length > 0) && (
        <section>
          <SectionTitle action={<LinkAction to="/profile/saved">Saved items</LinkAction>}>Recently viewed</SectionTitle>
          {recent.length ? (
            <div className="flex flex-wrap gap-2">
              {recent.slice(0, 8).map((r) => (
                <Link key={`${r.type}:${r.id}`} to={r.href} className="rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] text-ink-soft hover:bg-forest-50">
                  {r.label}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">Nothing viewed yet.</p>
          )}
          {saved.length > 0 && <p className="mt-2 text-[12.5px] text-ink-muted">You have {saved.length} saved item{saved.length > 1 ? 's' : ''}.</p>}
        </section>
      )}

      <section>
        <SectionTitle action={<LinkAction to="/learn">Library</LinkAction>}>Start learning</SectionTitle>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PUBLIC_ARTICLES.slice(0, 4).map((a) => (
            <Link key={a.id} to={`/learn/${a.id}`} className="rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200">
              <Tag tone="neutral">{a.readMinutes} min read</Tag>
              <p className="mt-2 text-[14px] font-semibold leading-snug text-ink">{a.title}</p>
            </Link>
          ))}
        </div>
      </section>

      <p className="pb-2 text-center text-[11.5px] leading-relaxed text-ink-faint">
        CareLens provides educational information, not medical advice. {PUBLIC_INGREDIENTS.length} ingredients · {PUBLIC_TOPICS.length} topics · {PUBLIC_ARTICLES.length} articles in the database. Product records are fictional demos.
      </p>
    </div>
  );
}
