import { AlertTriangle, ArrowRight, HelpCircle, ScanText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, Chip, EmptyState, EvidenceBadge, Notice, PageHeader, SectionTitle, Tag } from '../components/ui';
import { PRODUCT_MAP } from '../data';
import { analyseIngredientList } from '../lib/analyzer';
import { useStore } from '../lib/store';

const EXAMPLES = [
  { label: 'Shampoo', text: 'Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Zinc Pyrithione, Glycol Distearate, Dimethicone, Sodium Chloride, Parfum, Limonene, Linalool, Sodium Benzoate, Citric Acid, Guar Hydroxypropyltrimonium Chloride' },
  { label: 'Face serum', text: 'Water, Niacinamide (5%), Glycerin, Sodium Hyaluronate, Panthenol, Butylene Glycol, Xanthan Gum, Phenoxyethanol, Ethylhexylglycerin' },
  { label: 'Sunscreen', text: 'Aqua, Octocrylene, Butyl Methoxydibenzoylmethane, Zinc Oxide, Glycerin, Alcohol Denat., Silica, Dimethicone, Tocopheryl Acetate, Fragrance' },
  { label: 'Toothpaste', text: 'Sorbitol, Aqua, Hydrated Silica, Sodium Lauryl Sulfate, Sodium Fluoride, Flavour, Cellulose Gum, Sodium Saccharin, Titanium Dioxide' },
];

export default function Analyse() {
  const [params] = useSearchParams();
  const from = params.get('from');
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { profile } = useStore();

  useEffect(() => {
    const p = from ? PRODUCT_MAP[from] : null;
    if (p) {
      const t = p.ingredients.map((i) => i.label).join(', ');
      setText(t);
      setSubmitted(t);
    }
  }, [from]);

  const result = useMemo(() => (submitted.trim() ? analyseIngredientList(submitted) : null), [submitted]);
  const fragranceSensitive = profile.sensitivities.includes('fragrance_sensitive') || profile.ingredientPrefs.includes('fragrance_free');

  return (
    <div>
      <PageHeader title="Ingredient-list analyser" subtitle="Paste an ingredient list from a label. We'll explain what we recognise and flag precautions." />
      <Card className="p-4">
        <label htmlFor="ing-list" className="mb-2 block text-[13.5px] font-medium">Ingredient list</label>
        <textarea
          id="ing-list"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="e.g. Aqua, Glycerin, Niacinamide, Sodium Hyaluronate, Phenoxyethanol…"
          className="w-full resize-y rounded-xl border border-line bg-ivory/50 p-3 text-[14px] outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-100"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => setSubmitted(text)} disabled={!text.trim()}><ScanText size={16} /> Analyse</Button>
          <Button variant="ghost" onClick={() => { setText(''); setSubmitted(''); }}>Clear</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-ink-muted">Try an example:</span>
          {EXAMPLES.map((e) => <Chip key={e.label} onClick={() => { setText(e.text); setSubmitted(e.text); }}>{e.label}</Chip>)}
        </div>
        <p className="mt-3 text-[12px] text-ink-faint">Text analysis runs entirely on your device. Image scanning is not available.</p>
      </Card>

      {!result ? (
        <div className="mt-6"><EmptyState icon={ScanText} title="Paste a list to begin">Separate ingredients with commas, semicolons or new lines — the way they appear on packaging.</EmptyState></div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-3 gap-2.5">
            <Card className="p-3 text-center"><p className="text-[22px] font-semibold">{result.entries.length}</p><p className="text-[12px] text-ink-muted">Entries</p></Card>
            <Card className="p-3 text-center"><p className="text-[22px] font-semibold text-forest-700">{result.recognised.length}</p><p className="text-[12px] text-ink-muted">Recognised</p></Card>
            <Card className="p-3 text-center"><p className="text-[22px] font-semibold text-amberx-700">{result.unrecognised.length}</p><p className="text-[12px] text-ink-muted">Not recognised</p></Card>
          </div>

          {result.precautions.length > 0 && (
            <section>
              <SectionTitle>Precautions to be aware of</SectionTitle>
              <div className="space-y-2">
                {result.precautions.map((p) => (
                  <div key={p.ingredientId + p.kind} className="flex gap-3 rounded-xl border border-[#EBDDB5] bg-amberx-50 px-4 py-3 text-[13.5px] text-amberx-700">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span><Link to={`/ingredient/${p.ingredientId}`} className="font-semibold underline">{p.ingredientName}</Link>: {p.message}{p.kind === 'fragrance_allergen' && fragranceSensitive ? ' You noted fragrance sensitivity.' : ''}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.functionsSummary.length > 0 && (
            <section>
              <SectionTitle>What these ingredients do</SectionTitle>
              <div className="flex flex-wrap gap-1.5">{result.functionsSummary.slice(0, 12).map((f) => <Tag key={f.fn} tone="neutral">{f.fn} · {f.count}</Tag>)}</div>
            </section>
          )}

          <section>
            <SectionTitle>Ingredient by ingredient</SectionTitle>
            <div className="space-y-2">
              {result.entries.map((e) => (
                <Card key={e.position + e.label} className="p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-6 shrink-0 text-[12px] text-ink-faint">{e.position}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-ink">{e.label}</p>
                      {e.ingredient ? (
                        <>
                          <p className="text-[12.5px] text-forest-700">
                            {e.ingredient.name !== e.label ? `${e.ingredient.name} · ` : ''}{e.ingredient.functions.join(', ')}
                            {e.matchType === 'fuzzy' && <span className="text-amberx-700"> · matched despite spelling — please check</span>}
                          </p>
                          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{e.ingredient.summary}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {e.ingredient.tier === 'full' && <EvidenceBadge level={e.ingredient.evidence.level} />}
                            {e.concentration && <Tag tone="neutral">Declared {e.concentration}</Tag>}
                            <Link to={`/ingredient/${e.ingredient.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-forest-700">Details & 5W1H <ArrowRight size={13} /></Link>
                          </div>
                        </>
                      ) : (
                        <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-amberx-700"><HelpCircle size={13} /> Not in the CareLens database — this doesn't mean it's harmful.</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle>How to read this</SectionTitle>
            <div className="space-y-2">{result.notes.map((n) => <Notice key={n}>{n}</Notice>)}</div>
          </section>
        </div>
      )}
    </div>
  );
}
