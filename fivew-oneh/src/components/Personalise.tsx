import { ChevronDown, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { PUBLIC_PRODUCTS, REGIONS } from '../data';
import { BUDGET_LABEL, EMPTY_PROFILE, hasPreferences, LABELS, type Budget, type Profile } from '../lib/personalise';
import { useStore } from '../lib/store';
import { Button, Chip, cx } from './ui';

type Keys<T> = Extract<keyof T, string>;

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-2 text-[14px] font-semibold text-ink">
        {title} {hint && <span className="font-normal text-ink-muted">{hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Row({ title, value, children }: { title: string; value: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line last:border-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex min-h-[48px] w-full items-center gap-3 text-left" aria-expanded={open}>
        <span className="flex-1 text-[14px] text-ink">{title}</span>
        <span className="max-w-[50%] truncate text-[13px] text-ink-muted">{value}</span>
        <ChevronDown size={16} className={cx('text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="flex flex-wrap gap-2 pb-4">{children}</div>}
    </div>
  );
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function PersonaliseForm({ onDone, onSkip }: { onDone?: () => void; onSkip?: () => void }) {
  const { profile, setProfile, clearProfile, setPersonalise } = useStore();
  const [p, setP] = useState<Profile>(profile);
  useEffect(() => {
    setP(profile);
  }, [profile]);
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const names = <T extends Record<string, string>>(map: T, keys: string[]) => (keys.length ? keys.map((k) => map[k]).join(', ') : 'None');

  return (
    <div>
      <p className="mb-5 text-[13.5px] text-ink-muted">
        Help us tailor information to your needs. Everything is optional, stays on this device, and can be changed or cleared any time. Preferences filter and add context to information — they are not a diagnosis.
      </p>

      <Group title="Skin type">
        {(Object.keys(LABELS.skinType) as Keys<typeof LABELS.skinType>[]).map((k) => (
          <Chip key={k} active={p.skinType === k} onClick={() => set({ skinType: p.skinType === k ? undefined : k })}>{LABELS.skinType[k]}</Chip>
        ))}
      </Group>
      <Group title="Skin concerns" hint="(optional)">
        {(Object.keys(LABELS.skinConcerns) as Keys<typeof LABELS.skinConcerns>[]).map((k) => (
          <Chip key={k} active={p.skinConcerns.includes(k)} onClick={() => set({ skinConcerns: toggle(p.skinConcerns, k) })}>{LABELS.skinConcerns[k]}</Chip>
        ))}
      </Group>
      <Group title="Hair type">
        {(Object.keys(LABELS.hairType) as Keys<typeof LABELS.hairType>[]).map((k) => (
          <Chip key={k} active={p.hairType === k} onClick={() => set({ hairType: p.hairType === k ? undefined : k })}>{LABELS.hairType[k]}</Chip>
        ))}
      </Group>
      <Group title="Scalp">
        {(Object.keys(LABELS.scalp) as Keys<typeof LABELS.scalp>[]).map((k) => (
          <Chip key={k} active={p.scalp === k} onClick={() => set({ scalp: p.scalp === k ? undefined : k })}>{LABELS.scalp[k]}</Chip>
        ))}
      </Group>
      <Group title="Hair & scalp concerns" hint="(optional)">
        {(Object.keys(LABELS.hairConcerns) as Keys<typeof LABELS.hairConcerns>[]).map((k) => (
          <Chip key={k} active={p.hairConcerns.includes(k)} onClick={() => set({ hairConcerns: toggle(p.hairConcerns, k) })}>{LABELS.hairConcerns[k]}</Chip>
        ))}
      </Group>
      <Group title="Oral care" hint="(optional)">
        {(Object.keys(LABELS.oralConcerns) as Keys<typeof LABELS.oralConcerns>[]).map((k) => (
          <Chip key={k} active={p.oralConcerns.includes(k)} onClick={() => set({ oralConcerns: toggle(p.oralConcerns, k) })}>{LABELS.oralConcerns[k]}</Chip>
        ))}
      </Group>

      <h3 className="mb-1 text-[14px] font-semibold text-ink">Other preferences</h3>
      <div className="mb-6 rounded-xl border border-line bg-white px-4">
        <Row title="Age range" value={p.ageRange ? LABELS.ageRange[p.ageRange as Keys<typeof LABELS.ageRange>] : 'Not set'}>
          {(Object.keys(LABELS.ageRange) as Keys<typeof LABELS.ageRange>[]).map((k) => (
            <Chip key={k} active={p.ageRange === k} onClick={() => set({ ageRange: p.ageRange === k ? undefined : k })}>{LABELS.ageRange[k]}</Chip>
          ))}
        </Row>
        <Row title="Region / city" value={REGIONS.find((r) => r.id === p.regionId)?.name ?? 'Not set'}>
          {REGIONS.map((r) => (
            <Chip key={r.id} active={p.regionId === r.id} onClick={() => set({ regionId: p.regionId === r.id ? undefined : r.id })}>{r.name}</Chip>
          ))}
        </Row>
        <Row title="Climate" value={p.climate ? LABELS.climate[p.climate] : p.regionId ? 'From region' : 'Not set'}>
          {(Object.keys(LABELS.climate) as Keys<typeof LABELS.climate>[]).map((k) => (
            <Chip key={k} active={p.climate === k} onClick={() => set({ climate: p.climate === k ? undefined : k })}>{LABELS.climate[k]}</Chip>
          ))}
        </Row>
        <Row title="Budget (per product)" value={BUDGET_LABEL[p.budget]}>
          {(Object.keys(BUDGET_LABEL) as Budget[]).map((k) => (
            <Chip key={k} active={p.budget === k} onClick={() => set({ budget: k })}>{BUDGET_LABEL[k]}</Chip>
          ))}
        </Row>
        <Row title="Ingredient preferences" value={names(LABELS.ingredientPrefs, p.ingredientPrefs)}>
          {(Object.keys(LABELS.ingredientPrefs) as Keys<typeof LABELS.ingredientPrefs>[]).map((k) => (
            <Chip key={k} active={p.ingredientPrefs.includes(k)} onClick={() => set({ ingredientPrefs: toggle(p.ingredientPrefs, k) })}>{LABELS.ingredientPrefs[k]}</Chip>
          ))}
        </Row>
        <Row title="Known sensitivities" value={names(LABELS.sensitivities, p.sensitivities)}>
          {(Object.keys(LABELS.sensitivities) as Keys<typeof LABELS.sensitivities>[]).map((k) => (
            <Chip key={k} active={p.sensitivities.includes(k)} onClick={() => set({ sensitivities: toggle(p.sensitivities, k) })}>{LABELS.sensitivities[k]}</Chip>
          ))}
        </Row>
        <Row title="Current products" value={p.currentProducts.length ? `${p.currentProducts.length} selected` : 'None'}>
          {PUBLIC_PRODUCTS.map((pr) => (
            <Chip key={pr.id} active={p.currentProducts.includes(pr.id)} onClick={() => set({ currentProducts: toggle(p.currentProducts, pr.id) })}>{pr.name}</Chip>
          ))}
        </Row>
        <Row title="Information goals" value={names(LABELS.goals, p.goals)}>
          {(Object.keys(LABELS.goals) as Keys<typeof LABELS.goals>[]).map((k) => (
            <Chip key={k} active={p.goals.includes(k)} onClick={() => set({ goals: toggle(p.goals, k) })}>{LABELS.goals[k]}</Chip>
          ))}
        </Row>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="min-w-[140px]"
          onClick={() => {
            setProfile(p);
            setPersonalise(true);
            onDone?.();
          }}
        >
          Save
        </Button>
        {onSkip && <Button variant="ghost" onClick={onSkip}>Skip for now</Button>}
        <Button
          variant="danger"
          className="ml-auto"
          onClick={() => {
            clearProfile();
            setP(EMPTY_PROFILE);
          }}
        >
          Clear preferences
        </Button>
      </div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ivory p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={18} className="text-forest-700" />
          <h2 className="flex-1 text-[16px] font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ivory-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Reusable "Personalise for me" control shown on listing and detail pages. */
export function PersonaliseControl({ compact = false }: { compact?: boolean }) {
  const { profile, personalise, setPersonalise } = useStore();
  const [open, setOpen] = useState(false);
  const has = hasPreferences(profile);
  return (
    <>
      {has ? (
        <div className={cx('flex items-center gap-3 rounded-xl border border-forest-100 bg-forest-50 px-4', compact ? 'py-2' : 'py-3')}>
          <SlidersHorizontal size={17} className="shrink-0 text-forest-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-forest-800">{personalise ? 'Personalised for you' : 'Personalisation paused'}</p>
            {!compact && <p className="truncate text-[12px] text-forest-700/80">Results are ordered and annotated using your saved preferences.</p>}
          </div>
          <button type="button" className="text-[13px] font-medium text-forest-700 underline-offset-2 hover:underline" onClick={() => setOpen(true)}>
            Edit
          </button>
          <label className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" className="peer sr-only" checked={personalise} onChange={(e) => setPersonalise(e.target.checked)} aria-label="Apply my preferences" />
            <span className="h-6 w-11 rounded-full bg-line-strong transition-colors peer-checked:bg-forest-700" />
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </label>
        </div>
      ) : (
        <Button className="w-full" onClick={() => setOpen(true)}>
          <SlidersHorizontal size={17} /> Personalise for me
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Personalise for better results">
        <PersonaliseForm onDone={() => setOpen(false)} onSkip={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

export function RelevanceNotes({ reasons, cautions }: { reasons: string[]; cautions: string[] }) {
  if (!reasons.length && !cautions.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {reasons.slice(0, 2).map((r) => (
        <span key={r} className="rounded-full bg-forest-50 px-2 py-0.5 text-[11.5px] text-forest-700">{r}</span>
      ))}
      {cautions.slice(0, 2).map((c) => (
        <span key={c} className="rounded-full bg-amberx-50 px-2 py-0.5 text-[11.5px] text-amberx-700">{c}</span>
      ))}
    </div>
  );
}
