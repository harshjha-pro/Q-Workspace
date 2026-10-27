import { ChevronRight, Columns2, FlaskConical, ScanText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TopicRow } from '../components/Cards';
import { SearchBar } from '../components/SearchBar';
import { CATEGORY_ICONS, SectionTitle } from '../components/ui';
import { CATEGORIES, PUBLIC_INGREDIENTS, PUBLIC_TOPICS } from '../data';

export default function Explore() {
  const concerns = PUBLIC_TOPICS.filter((t) => t.kind === 'concern');
  const traditional = PUBLIC_TOPICS.filter((t) => t.kind === 'ayurvedic' || t.kind === 'home_remedy').slice(0, 4);
  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight">Explore</h1>
        <p className="mt-1 text-[14px] text-ink-muted">Browse categories, the ingredient database and care topics.</p>
      </header>
      <div className="lg:hidden"><SearchBar /></div>

      <section>
        <SectionTitle>Categories</SectionTitle>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICONS[c.icon];
            return (
              <Link key={c.id} to={`/category/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-forest-50 text-forest-700"><Icon size={20} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{c.name}</span>
                  <span className="block truncate text-[12.5px] text-ink-muted">{c.subcategories.map((s) => s.name).join(' · ')}</span>
                </span>
                <ChevronRight size={18} className="text-ink-faint" />
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle>Tools</SectionTitle>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {[
            { to: '/ingredients', icon: FlaskConical, title: 'Ingredient database', text: `${PUBLIC_INGREDIENTS.length} ingredients with evidence levels` },
            { to: '/analyse', icon: ScanText, title: 'Ingredient-list analyser', text: 'Paste a label and decode it' },
            { to: '/compare', icon: Columns2, title: 'Compare products', text: 'Side-by-side differences' },
          ].map(({ to, icon: Icon, title, text }) => (
            <Link key={to} to={to} className="rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200">
              <Icon size={20} className="text-forest-700" />
              <p className="mt-2 text-[14px] font-semibold">{title}</p>
              <p className="text-[12.5px] text-ink-muted">{text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Common concerns</SectionTitle>
        <div className="space-y-2.5">{concerns.map((t) => <TopicRow key={t.id} topic={t} />)}</div>
      </section>

      <section>
        <SectionTitle action={<Link to="/category/ayurveda" className="text-[13px] font-medium text-forest-600">View all</Link>}>Traditional care & home remedies</SectionTitle>
        <div className="space-y-2.5">{traditional.map((t) => <TopicRow key={t.id} topic={t} />)}</div>
      </section>
    </div>
  );
}
