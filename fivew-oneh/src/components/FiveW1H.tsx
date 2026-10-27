import { ChevronDown, ChevronRight, Clock, HelpCircle, ListChecks, MapPin, Sparkles, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FiveW1H as FiveW1HData, W1HKey } from '../data/types';
import { cx } from './ui';

export const W1H_ORDER: W1HKey[] = ['what', 'why', 'when', 'who', 'where', 'how'];

export const W1H_META: Record<W1HKey, { label: string; question: string; icon: typeof Clock }> = {
  what: { label: 'What?', question: 'What is it?', icon: Sparkles },
  why: { label: 'Why?', question: 'Why is it used?', icon: HelpCircle },
  when: { label: 'When?', question: 'When should it be used?', icon: Clock },
  who: { label: 'Who?', question: 'Who can use it?', icon: Users },
  where: { label: 'Where?', question: 'Where is it applied?', icon: MapPin },
  how: { label: 'How?', question: 'How is it used?', icon: ListChecks },
};

/**
 * The universal 5W1H explanation. "list" is the compact accordion used on
 * detail pages; "cards" is the full 5W1H guide view. Sections a topic does not
 * need are shown as not applicable rather than padded with filler.
 */
export function FiveW1H({ data, variant = 'list', initialOpen }: { data?: FiveW1HData; variant?: 'list' | 'cards'; initialOpen?: W1HKey }) {
  const [open, setOpen] = useState<W1HKey | null>(initialOpen ?? null);
  useEffect(() => {
    if (initialOpen) {
      setOpen(initialOpen);
      document.getElementById(`w1h-${initialOpen}`)?.scrollIntoView({ block: 'center' });
    }
  }, [initialOpen]);
  if (!data) return <p className="text-[13.5px] text-ink-muted">A 5W1H explanation is not yet available for this record.</p>;

  return (
    <div className={variant === 'cards' ? 'space-y-3' : 'space-y-2'}>
      {W1H_ORDER.map((key) => {
        const s = data[key];
        const meta = W1H_META[key];
        const Icon = meta.icon;
        const isOpen = open === key;
        return (
          <div
            key={key}
            id={`w1h-${key}`}
            className={cx('rounded-xl border bg-white transition-shadow', isOpen ? 'border-forest-200 shadow-card' : 'border-line', variant === 'cards' && 'rounded-2xl')}
          >
            <button
              type="button"
              className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
              onClick={() => setOpen(isOpen ? null : key)}
              aria-expanded={isOpen}
              aria-controls={`w1h-body-${key}`}
            >
              {variant === 'cards' && (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-50 text-forest-700">
                  <Icon size={18} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">{variant === 'cards' ? meta.label : meta.question}</span>
                {variant === 'cards' && <span className="block truncate text-[12.5px] text-ink-muted">{s ? s.summary : 'Not applicable for this topic'}</span>}
              </span>
              {variant === 'cards' ? (
                <ChevronRight size={18} className={cx('shrink-0 text-ink-faint transition-transform', isOpen && 'rotate-90')} />
              ) : (
                <ChevronDown size={18} className={cx('shrink-0 text-ink-faint transition-transform', isOpen && 'rotate-180')} />
              )}
            </button>
            {isOpen && (
              <div id={`w1h-body-${key}`} className="px-4 pb-4 text-[14px] leading-relaxed text-ink-soft">
                {s ? (
                  <>
                    <p>{s.summary}</p>
                    {s.points && s.points.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {s.points.map((p) => (
                          <li key={p} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-forest-500" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-ink-muted">This question isn't especially relevant for this topic.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Generic expandable section used for "Additional information" blocks. */
export function Expandable({ title, children, defaultOpen = false, count }: { title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line last:border-b-0">
      <button type="button" className="flex min-h-[48px] w-full items-center justify-between gap-3 py-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-[14px] font-medium text-ink">
          {title}
          {count !== undefined && <span className="ml-1.5 text-ink-faint">({count})</span>}
        </span>
        <ChevronDown size={18} className={cx('shrink-0 text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}
