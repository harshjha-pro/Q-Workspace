import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Paperclip, X } from 'lucide-react';
import { cx } from './primitives';

function FieldWrap({ id, label, hint, error, required, children }: { id: string; label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}{required && <span className="text-danger" aria-hidden> *</span>}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}

type Common = { label: string; hint?: string; error?: string };

export function TextField({ label, hint, error, className, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error} required={rest.required}>
      <input id={id} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={cx('input', error && 'border-danger', className)} {...rest} />
    </FieldWrap>
  );
}

export function TextArea({ label, hint, error, className, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error} required={rest.required}>
      <textarea id={id} rows={4} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={cx('input py-2', error && 'border-danger', className)} {...rest} />
    </FieldWrap>
  );
}

export function Select({ label, hint, error, options, className, placeholder, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: Array<string | { value: string; label: string }>; placeholder?: string }) {
  const id = useId();
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error} required={rest.required}>
      <select id={id} aria-invalid={!!error || undefined} className={cx('input', error && 'border-danger', className)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </FieldWrap>
  );
}

export function Checkbox({ label, checked, onChange, description }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 accent-navy" />
      <label htmlFor={id} className="text-sm text-ink">{label}{description && <span className="block text-xs text-muted">{description}</span>}</label>
    </div>
  );
}

export function Toggle({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div><p className="text-sm font-medium text-ink">{label}</p>{description && <p className="text-xs text-muted">{description}</p>}</div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-teal' : 'bg-line')}>
        <span className={cx('absolute top-1 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
    </div>
  );
}

export function RadioCards<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string; description?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.value} className={cx('card cursor-pointer p-3 text-sm', value === o.value && 'border-navy ring-2 ring-navy/15')}>
            <input type="radio" className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="font-semibold text-ink">{o.label}</span>
            {o.description && <span className="block text-xs text-muted">{o.description}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const MAX_MB = 5;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * File picker that only records file names in demo mode. Real uploads must be validated
 * again on the server (type sniffing, size limits, malware scanning) and stored privately.
 */
export function FilePicker({ label, value, onChange, accept = 'image/*', multiple = true, hint }: { label: string; value: string[]; onChange: (names: string[]) => void; accept?: string; multiple?: boolean; hint?: string }) {
  const id = useId();
  const [err, setErr] = useState('');
  return (
    <div>
      <span className="label">{label}</span>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-white px-3 text-sm text-muted hover:border-navy/40">
        <Paperclip className="size-4" aria-hidden /> Choose file{multiple ? 's' : ''}
      </label>
      <input id={id} type="file" className="sr-only" accept={accept} multiple={multiple} onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        const bad = files.find((f) => f.size > MAX_MB * 1024 * 1024 || (OK_TYPES.length && !OK_TYPES.includes(f.type)));
        if (bad) { setErr(`“${bad.name}” is not allowed. Use JPG, PNG, WebP or PDF under ${MAX_MB} MB.`); return; }
        setErr('');
        onChange(multiple ? [...value, ...files.map((f) => f.name)].slice(0, 6) : files.map((f) => f.name));
        e.target.value = '';
      }} />
      <p className="mt-1 text-xs text-muted">{hint ?? `Demo mode stores only the file name — the file is not uploaded. Max ${MAX_MB} MB.`}</p>
      {err && <p className="mt-1 text-xs font-medium text-danger" role="alert">{err}</p>}
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {value.map((n) => (
            <li key={n} className="chip">{n}<button type="button" aria-label={`Remove ${n}`} onClick={() => onChange(value.filter((x) => x !== n))}><X className="size-3.5" aria-hidden /></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tiny validation helper: rules return an error string or ''. */
export function validate<T extends Record<string, unknown>>(values: T, rules: Partial<Record<keyof T, (v: T[keyof T], all: T) => string>>) {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const k in rules) {
    const msg = rules[k]!(values[k], values);
    if (msg) errors[k] = msg;
  }
  return errors;
}

export const required = (label: string) => (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? `${label} is required.` : '');
export const minLen = (label: string, n: number) => (v: unknown) => (String(v ?? '').trim().length < n ? `${label} must be at least ${n} characters.` : '');
