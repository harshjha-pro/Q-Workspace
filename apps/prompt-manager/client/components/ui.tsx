import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2, Search, X, Eye, EyeOff, Star } from 'lucide-react';
import { cx } from '../lib/util';
import { STATUS_LABEL, type Status, type PromptType } from '../../shared/schema';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'danger-ghost';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; loading?: boolean; block?: boolean; iconOnly?: boolean }
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', icon, loading, block, iconOnly, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', iconOnly && 'btn-icon', className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, icon, variant = 'ghost', size = 'md', ...rest }: Omit<BtnProps, 'iconOnly' | 'children'> & { label: string; icon: ReactNode }) {
  return <Button variant={variant} size={size} iconOnly aria-label={label} title={label} icon={icon} {...rest} />;
}

export function ButtonLink({ to, variant = 'secondary', size = 'md', icon, children, className, block }: { to: string; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; children?: ReactNode; className?: string; block?: boolean }) {
  return <Link to={to} className={cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className)}>{icon}{children}</Link>;
}

export function Field({ label, hint, error, required, children, htmlFor, action }: { label?: ReactNode; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactNode; htmlFor?: string; action?: ReactNode }) {
  return (
    <div className="field">
      {label && <div className="row between"><label className="label" htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden>*</span>}</label>{action}</div>}
      {children}
      {error ? <div className="error-text" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...p }, ref) {
  return <input ref={ref} className={cx('input', invalid && 'invalid', className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...p }, ref) {
  return <textarea ref={ref} className={cx('textarea', invalid && 'invalid', className)} {...p} />;
});
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('select', className)} {...p}>{children}</select>;
}

export function PasswordInput({ value, onChange, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input className="input" type={show ? 'text' : 'password'} value={value} onChange={onChange} style={{ paddingRight: 44 }} {...p} />
      <span className="input-end"><IconButton size="sm" label={show ? 'Hide password' : 'Show password'} icon={show ? <EyeOff /> : <Eye />} onClick={() => setShow(!show)} /></span>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', autoFocus, className }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  return (
    <div className={cx('input-wrap', className)}>
      <Search />
      <input className="input" type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} aria-label={placeholder} />
      {value && <span className="input-end"><IconButton size="sm" label="Clear search" icon={<X />} onClick={() => onChange('')} /></span>}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return <label className="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="row between gap-16">
      {label && <label htmlFor={id} className="col gap-4" style={{ cursor: 'pointer' }}><span className="strong" style={{ fontWeight: 500 }}>{label}</span>{hint && <span className="hint">{hint}</span>}</label>}
      <span className="switch"><input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span /></span>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; label?: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.icon}{o.label}</button>)}
    </div>
  );
}

export function Chip({ active, onClick, children, icon }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: ReactNode }) {
  return <button type="button" className="chip" aria-pressed={!!active} onClick={onClick}>{icon}{children}</button>;
}

export function Badge({ tone, children }: { tone?: 'success' | 'warning' | 'danger' | 'primary' | 'outline'; children: ReactNode }) {
  return <span className={cx('badge', tone === 'primary' ? 'badge-mandatory' : tone && `badge-${tone}`)}>{children}</span>;
}

export function TypeBadge({ type }: { type: PromptType }) {
  return <span className={cx('badge', type === 'mandatory' ? 'badge-mandatory' : 'badge-optional')}>{type === 'mandatory' ? 'Mandatory' : 'Optional'}</span>;
}
export function StatusBadge({ status }: { status: Status }) {
  return <span className={cx('badge', `status-${status}`)}><span className="dot" />{STATUS_LABEL[status]}</span>;
}
export function Tags({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags?.length) return null;
  return <span className="row gap-4 row-wrap">{tags.slice(0, max).map((t) => <span key={t} className="tag">{t}</span>)}{tags.length > max && <span className="tag">+{tags.length - max}</span>}</span>;
}
export function FavStar({ on, onToggle, label = 'favourite' }: { on: boolean; onToggle: () => void; label?: string }) {
  return <IconButton size="sm" label={on ? `Remove ${label}` : `Mark as ${label}`} icon={<Star className={on ? 'star' : ''} fill={on ? 'currentColor' : 'none'} />} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }} />;
}

export function Card({ children, className, pad, ...rest }: { children: ReactNode; className?: string; pad?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('card', pad && 'card-pad', className)} {...rest}>{children}</div>;
}
export function CardHead({ title, actions, sub }: { title: ReactNode; actions?: ReactNode; sub?: ReactNode }) {
  return <div className="card-head"><div className="col gap-4" style={{ minWidth: 0 }}><h2>{title}</h2>{sub && <span className="small muted">{sub}</span>}</div>{actions && <div className="row">{actions}</div>}</div>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="icon-tile lg tone-indigo">{icon}</div><h3>{title}</h3>{children && <p>{children}</p>}{action && <div className="row mt-8 row-wrap" style={{ justifyContent: 'center' }}>{action}</div>}</div>;
}

export function ProgressBar({ value, tone, size }: { value: number; tone?: 'primary' | 'success'; size?: 'sm' }) {
  return <div className={cx('progress', tone === 'primary' && 'primary', size)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number; icon?: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => <button key={t.value} role="tab" type="button" className="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>{t.icon}{t.label}{t.count !== undefined && <span className="count">{t.count}</span>}</button>)}
    </div>
  );
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="row gap-4" style={{ minWidth: 0 }}>
          {i > 0 && <ChevronRight />}
          {it.to && i < items.length - 1 ? <Link to={it.to} className="truncate">{it.label}</Link> : <span className="current truncate" aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHead({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[] }) {
  return (
    <>
      {crumbs && <Crumbs items={crumbs} />}
      <div className="page-head">
        <div style={{ minWidth: 0 }}><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="row muted small" role="status"><Loader2 className="spin" style={{ width: 16, height: 16, animation: 'spin .8s linear infinite' }} />{label}</div>;
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className={cx('step', i < current && 'done', i === current && 'current')} aria-current={i === current ? 'step' : undefined}>
          <span className="bubble">{i < current ? '✓' : i + 1}</span>
          <span className="step-label">{s}</span>
        </li>
      ))}
    </ol>
  );
}
