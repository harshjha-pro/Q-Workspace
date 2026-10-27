import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IngredientRow } from '../components/Cards';
import { PersonaliseControl } from '../components/Personalise';
import { Chip, EmptyState, EVIDENCE_META, PageHeader } from '../components/ui';
import { CATEGORY_MAP, PUBLIC_INGREDIENTS } from '../data';
import type { EvidenceLevel } from '../data/types';
import { relevance } from '../lib/personalise';
import { search } from '../lib/search';
import { useStore } from '../lib/store';
import { ingredientGroup } from '../lib/taxonomy';

export default function Ingredients() {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [level, setLevel] = useState<EvidenceLevel | ''>('');
  const [detailedOnly, setDetailedOnly] = useState(false);
  const { activeProfile } = useStore();
  const groups = CATEGORY_MAP.ingredients.subcategories;

  const list = useMemo(() => {
    const keys = q.trim() ? search(q, { types: ['ingredient'] }).map((h) => h.doc.id) : null;
    let items = PUBLIC_INGREDIENTS.filter((i) => (group === 'all' || ingredientGroup(i) === group) && (!level || i.evidence.level === level) && (!detailedOnly || i.tier === 'full'));
    if (keys) items = keys.map((id) => items.find((i) => i.id === id)).filter(Boolean) as typeof items;
    else items = [...items].sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === 'full' ? -1 : 1));
    if (activeProfile && !keys) items = [...items].sort((a, b) => relevance(activeProfile, b.suitability).score - relevance(activeProfile, a.suitability).score);
    return items;
  }, [q, group, level, detailedOnly, activeProfile]);

  return (
    <div>
      <PageHeader title="Ingredient database" subtitle="Common names, INCI names, functions, evidence and precautions." />
      <label className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3">
        <Search size={16} className="text-ink-faint" />
        <span className="sr-only">Search ingredients</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, INCI name or synonym (e.g. aqua, haldi)" className="h-full flex-1 bg-transparent text-[14px] outline-none" />
      </label>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={group === 'all'} onClick={() => setGroup('all')}>All</Chip>
        {groups.map((g) => <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>{g.name}</Chip>)}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label="Evidence level" value={level} onChange={(e) => setLevel(e.target.value as EvidenceLevel | '')} className="min-h-[36px] rounded-full border border-line bg-white px-3 text-[13px]">
          <option value="">Any evidence level</option>
          {(Object.keys(EVIDENCE_META) as EvidenceLevel[]).map((l) => <option key={l} value={l}>{EVIDENCE_META[l].label}</option>)}
        </select>
        <Chip active={detailedOnly} onClick={() => setDetailedOnly(!detailedOnly)}>Full 5W1H guides only</Chip>
      </div>
      <div className="mb-5"><PersonaliseControl compact /></div>
      <p className="mb-3 text-[12.5px] text-ink-muted">{list.length} ingredient{list.length === 1 ? '' : 's'}</p>
      {list.length ? (
        <div className="space-y-2.5">{list.map((i) => <IngredientRow key={i.id} ingredient={i} rel={relevance(activeProfile, i.suitability)} />)}</div>
      ) : (
        <EmptyState title="No ingredients found">Try another spelling, an INCI name, or clear the filters.</EmptyState>
      )}
    </div>
  );
}
