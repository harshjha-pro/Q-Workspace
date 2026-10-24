import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { Button, cx } from './primitives';

/* ---------- Dialog: native <dialog> gives focus trapping, Esc to close and inert background ---------- */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx('m-auto w-[calc(100%-24px)] rounded-2xl p-0 backdrop:bg-navy/50 shadow-xl', size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg')}>
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <div>
              <h2 id={titleId} className="text-lg font-bold text-navy">{title}</h2>
              {description && <div className="text-sm text-muted mt-0.5">{description}</div>}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-page" aria-label="Close dialog"><X className="size-5" aria-hidden /></button>
          </div>
          <div className="overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- Toasts ---------- */
type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; text: string; action?: { label: string; onClick: () => void } }
interface Ctx { toast: (text: string, tone?: ToastTone, action?: ToastItem['action']) => void; confirm: (o: ConfirmOptions) => Promise<boolean> }
interface ConfirmOptions { title: string; message: string; confirmLabel?: string; danger?: boolean }

const UICtx = createContext<Ctx | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirm] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const toast = useCallback((text: string, tone: ToastTone = 'success', action?: ToastItem['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : 3500);
  }, []);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })), []);
  const close = (v: boolean) => { confirmState?.resolve(v); setConfirm(null); };
  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite" role="status">
        {toasts.map((t) => {
          const I = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? CircleAlert : Info;
          return (
            <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-navy px-4 py-3 text-sm text-white shadow-lg">
              <I className={cx('size-5 shrink-0', t.tone === 'success' ? 'text-teal-100' : t.tone === 'error' ? 'text-red-300' : 'text-amber')} aria-hidden />
              <span>{t.text}</span>
              {t.action && <button type="button" className="ml-1 font-semibold text-amber" onClick={() => { t.action!.onClick(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}
            </div>
          );
        })}
      </div>
      <Dialog open={!!confirmState} onClose={() => close(false)} title={confirmState?.title ?? ''} size="sm"
        footer={<><Button variant="secondary" onClick={() => close(false)}>Cancel</Button><Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{confirmState?.confirmLabel ?? 'Confirm'}</Button></>}>
        <p className="text-ink">{confirmState?.message}</p>
      </Dialog>
    </UICtx.Provider>
  );
}

export function useUI() {
  const c = useContext(UICtx);
  if (!c) throw new Error('useUI must be used inside UIProvider');
  return c;
}

/* ---------- Tabs (WAI-ARIA tabs with arrow-key support) ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, label, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cx('scroll-x', className)}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} role="tab" type="button" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)} onClick={() => onChange(t.id)}
          className={cx('inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors', value === t.id ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:border-brand/40')}>
          {t.label}{t.count !== undefined && <span className={cx('ml-1.5 rounded-full px-1.5 text-xs', value === t.id ? 'bg-white/20' : 'bg-page text-muted')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
