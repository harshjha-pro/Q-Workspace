import { Clock, FileText, FlaskConical, HelpCircle, LayoutGrid, Package, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { suggest, type Suggestion } from '../lib/search';
import { useStore } from '../lib/store';
import { cx } from './ui';

const KIND_ICON = { ingredient: FlaskConical, product: Package, topic: Sparkles, article: FileText, category: LayoutGrid, question: HelpCircle } as const;

export const SEARCH_PLACEHOLDER = 'Search products, ingredients, concerns or ask a question...';

export function SearchBar({ initial = '', autoFocus = false, compact = false, onSubmitted }: { initial?: string; autoFocus?: boolean; compact?: boolean; onSubmitted?: (q: string) => void }) {
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const { history, addHistory, removeHistory, clearHistory } = useStore();
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQ(initial);
  }, [initial]);
  useEffect(() => {
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const suggestions: Suggestion[] = useMemo(() => (q.trim().length >= 2 ? suggest(q) : []), [q]);
  const showHistory = open && q.trim().length < 2 && history.length > 0;

  const submit = (text: string) => {
    const t = text.trim();
    if (!t) return;
    addHistory(t);
    setOpen(false);
    onSubmitted?.(t);
    navigate(`/search?q=${encodeURIComponent(t)}`);
  };

  const choose = (s: Suggestion) => {
    setOpen(false);
    if (s.href) {
      addHistory(s.label);
      navigate(s.href);
    } else submit(s.label);
  };

  return (
    <div ref={wrap} className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && suggestions[active]) choose(suggestions[active]);
          else submit(q);
        }}
      >
        <label className={cx('flex items-center gap-2 rounded-2xl border border-line bg-white px-3.5 shadow-card focus-within:border-forest-500 focus-within:ring-2 focus-within:ring-forest-100', compact ? 'h-11' : 'h-[52px]')}>
          <Search size={18} className="shrink-0 text-ink-faint" aria-hidden />
          <span className="sr-only">Search</span>
          <input
            type="search"
            value={q}
            autoFocus={autoFocus}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder={SEARCH_PLACEHOLDER}
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            enterKeyHint="search"
          />
          {q && (
            <button type="button" onClick={() => { setQ(''); setOpen(true); }} className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-ivory-100" aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </label>
      </form>

      {open && (suggestions.length > 0 || showHistory) && (
        <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-lg">
          {showHistory && (
            <>
              <div className="flex items-center justify-between px-4 pb-1 pt-2 text-[12px] font-medium text-ink-muted">
                <span>Recent searches</span>
                <button type="button" className="text-forest-700 hover:underline" onClick={() => clearHistory()}>
                  Clear all
                </button>
              </div>
              {history.slice(0, 6).map((h) => (
                <div key={h} className="flex items-center hover:bg-ivory-100">
                  <button type="button" className="flex min-h-[44px] flex-1 items-center gap-3 px-4 text-left text-[14px] text-ink" onClick={() => submit(h)}>
                    <Clock size={16} className="text-ink-faint" /> {h}
                  </button>
                  <button type="button" className="mr-2 grid h-9 w-9 place-items-center rounded-full text-ink-faint hover:bg-white" aria-label={`Remove ${h} from history`} onClick={() => removeHistory(h)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </>
          )}
          {suggestions.map((s, i) => {
            const Icon = KIND_ICON[s.kind];
            return (
              <button
                key={s.label + s.kind}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className={cx('flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-[14px] text-ink', i === active ? 'bg-forest-50' : 'hover:bg-ivory-100')}
              >
                <Icon size={16} className="shrink-0 text-forest-600" />
                <span className="flex-1 truncate">{s.label}</span>
                <span className="text-[11.5px] capitalize text-ink-faint">{s.kind}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
