import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { Button, IconButton, Input, Field } from './ui';
import { cx, useIsMobile } from '../lib/util';

// ---------- Modal (dialog on desktop, bottom sheet / full screen on mobile) ----------
let openCount = 0;
export function Modal({ open, onClose, title, children, footer, size, full, dismissable = true, labelledBy }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'narrow' | 'wide' | 'xwide'; full?: boolean; dismissable?: boolean; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(null);
  // Keep the latest callbacks in refs so re-renders never re-run the open/focus effect.
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const dismissRef = useRef(dismissable); dismissRef.current = dismissable;
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    openCount++;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      if (ref.current?.contains(document.activeElement)) return; // user already moved focus inside
      const el = ref.current?.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]), textarea, select, button.btn-primary');
      (el ?? ref.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissRef.current) { e.stopPropagation(); closeRef.current(); }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (--openCount === 0) document.body.style.overflow = '';
      (prevFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissable) onClose(); }}>
      <div ref={ref} className={cx('modal', size, full && 'full')} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        <div className="sheet-handle" />
        {title !== undefined && (
          <div className="modal-head">
            <h2 id={labelledBy}>{title}</h2>
            {dismissable && <IconButton label="Close" icon={<X />} onClick={onClose} />}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Action menu (popover on desktop, action sheet on mobile) ----------
export interface MenuItem { label: string; icon?: ReactNode; onClick?: () => void; danger?: boolean; divider?: boolean; disabled?: boolean; hidden?: boolean }
export function ActionMenu({ trigger, items, title, align = 'end' }: { trigger: (p: { onClick: (e: React.MouseEvent) => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean }) => ReactNode; items: MenuItem[]; title?: string; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const visible = items.filter((i) => !i.hidden);
  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || mobile || !anchor.current || !menuRef.current) return;
    const r = anchor.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let left = align === 'end' ? r.right - m.width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));
    let top = r.bottom + 6;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 6);
    setPos({ top, left });
  }, [open, mobile, align]);

  useEffect(() => {
    if (!open || mobile) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = [...(menuRef.current?.querySelectorAll<HTMLElement>('.menu-item:not(:disabled)') ?? [])];
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
      }
    };
    const onScroll = () => close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    setTimeout(() => menuRef.current?.querySelector<HTMLElement>('.menu-item')?.focus(), 0);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); };
  }, [open, mobile]);

  const renderItems = () => visible.map((it, i) => it.divider ? <div key={i} className="menu-sep" /> : (
    <button key={i} type="button" role="menuitem" className={cx('menu-item', it.danger && 'danger')} disabled={it.disabled} onClick={(e) => { e.stopPropagation(); close(); it.onClick?.(); }}>{it.icon}{it.label}</button>
  ));

  return (
    <>
      {trigger({ onClick: (e) => { e.preventDefault(); e.stopPropagation(); anchor.current = e.currentTarget as HTMLElement; setOpen((o) => !o); }, 'aria-haspopup': 'menu', 'aria-expanded': open })}
      {open && !mobile && createPortal(<div ref={menuRef} className="menu" role="menu" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }} onClick={(e) => e.stopPropagation()}>{renderItems()}</div>, document.body)}
      {mobile && <Modal open={open} onClose={close} title={title ?? ''}><div className="action-sheet" role="menu">{renderItems()}</div></Modal>}
    </>
  );
}

// ---------- Imperative confirm / prompt dialogs ----------
interface DialogReq { kind: 'confirm' | 'prompt'; title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean; defaultValue?: string; label?: string; placeholder?: string; resolve: (v: any) => void }
let dialog: DialogReq | null = null;
const dSubs = new Set<() => void>();
const setDialog = (d: DialogReq | null) => { dialog = d; dSubs.forEach((s) => s()); };
export const confirmDialog = (o: Omit<DialogReq, 'kind' | 'resolve'>) => new Promise<boolean>((resolve) => setDialog({ ...o, kind: 'confirm', resolve }));
export const promptDialog = (o: Omit<DialogReq, 'kind' | 'resolve'>) => new Promise<string | null>((resolve) => setDialog({ ...o, kind: 'prompt', resolve }));

export function DialogHost() {
  const d = useSyncExternalStore((l) => { dSubs.add(l); return () => dSubs.delete(l); }, () => dialog);
  const [val, setVal] = useState('');
  useEffect(() => { if (d?.kind === 'prompt') setVal(d.defaultValue ?? ''); }, [d]);
  if (!d) return null;
  const done = (v: any) => { d.resolve(v); setDialog(null); };
  const submit = () => (d.kind === 'confirm' ? done(true) : val.trim() && done(val.trim()));
  return (
    <Modal open size="narrow" title={d.title} onClose={() => done(d.kind === 'confirm' ? false : null)}
      footer={<><Button onClick={() => done(d.kind === 'confirm' ? false : null)}>Cancel</Button><Button variant={d.danger ? 'danger' : 'primary'} onClick={submit} disabled={d.kind === 'prompt' && !val.trim()}>{d.confirmLabel ?? 'Confirm'}</Button></>}>
      {d.message && <div className="muted">{d.message}</div>}
      {d.kind === 'prompt' && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label={d.label}><Input value={val} placeholder={d.placeholder} onChange={(e) => setVal(e.target.value)} autoFocus maxLength={300} /></Field>
        </form>
      )}
    </Modal>
  );
}

// ---------- Toasts ----------
interface ToastItem { id: number; kind: 'success' | 'error' | 'info' | 'warn'; text: string; action?: { label: string; onClick: () => void } }
let toasts: ToastItem[] = [];
let tid = 0;
const tSubs = new Set<() => void>();
const pushToast = (t: Omit<ToastItem, 'id'>, ms = 4000) => {
  const id = ++tid;
  toasts = [...toasts.slice(-3), { ...t, id }];
  tSubs.forEach((s) => s());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== id); tSubs.forEach((s) => s()); }, t.kind === 'error' ? ms + 3000 : ms);
};
export const toast = {
  success: (text: string, action?: ToastItem['action']) => pushToast({ kind: 'success', text, action }),
  error: (text: string) => pushToast({ kind: 'error', text }),
  info: (text: string, action?: ToastItem['action']) => pushToast({ kind: 'info', text, action }),
  warn: (text: string, action?: ToastItem['action']) => pushToast({ kind: 'warn', text, action }, 6000),
};
export function ToastHost() {
  const list = useSyncExternalStore((l) => { tSubs.add(l); return () => tSubs.delete(l); }, () => toasts);
  return createPortal(
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cx('toast', t.kind)} role={t.kind === 'error' ? 'alert' : 'status'}>
          {t.kind === 'success' ? <CheckCircle2 /> : t.kind === 'error' ? <AlertCircle /> : t.kind === 'warn' ? <AlertTriangle /> : <Info />}
          <span>{t.text}</span>
          {t.action && <button onClick={() => { t.action!.onClick(); toasts = toasts.filter((x) => x.id !== t.id); tSubs.forEach((s) => s()); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>,
    document.body,
  );
}
