import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { BadgeCheck, CircleAlert, Clock3, FlaskConical, Info, Loader2, Megaphone, ShieldAlert, Star } from 'lucide-react';
import type { Verification } from '@/types/models';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'teal' | 'danger' | 'amber';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:bg-navy-deep',
  secondary: 'bg-white text-ink border border-line hover:border-navy/40',
  ghost: 'text-navy hover:bg-navy-50',
  teal: 'bg-teal text-white hover:bg-teal/90',
  danger: 'bg-danger text-white hover:bg-danger/90',
  amber: 'bg-amber text-navy-deep hover:bg-amber/90'
};
const SIZES = { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-4 text-[15px]', lg: 'min-h-12 px-5 text-base' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZES;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-60', VARIANTS[variant], SIZES[size], block && 'w-full', className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({ variant = 'primary', size = 'md', icon, block, className, children, ...rest }: LinkProps & { variant?: Variant; size?: keyof typeof SIZES; icon?: ReactNode; block?: boolean }) {
  return (
    <Link className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors no-underline', VARIANTS[variant], SIZES[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function Card({ className, children, as: As = 'div', ...rest }: { className?: string; children: ReactNode; as?: 'div' | 'article' | 'section' | 'li' } & Record<string, unknown>) {
  return <As className={cx('card', className)} {...rest}>{children}</As>;
}

type Tone = 'navy' | 'teal' | 'amber' | 'red' | 'gray' | 'blue' | 'violet' | 'green';
const TONES: Record<Tone, string> = {
  navy: 'bg-navy-50 text-navy', teal: 'bg-teal-50 text-teal', amber: 'bg-amber-50 text-amber-700', red: 'bg-danger-50 text-danger',
  gray: 'bg-page text-muted border border-line', blue: 'bg-blue-50 text-blue-700', violet: 'bg-violet-50 text-violet-700', green: 'bg-green-50 text-green-700'
};

export function Badge({ tone = 'gray', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[tone], className)}>{icon}{children}</span>;
}

/** Marks sample / simulated content. Always visible where users could mistake it for live data. */
export function DemoBadge({ label = 'Demo' }: { label?: string }) {
  return <Badge tone="amber" icon={<FlaskConical className="size-3" aria-hidden />}>{label}</Badge>;
}

export function SponsoredTag({ label = 'Sponsored' }: { label?: string }) {
  return <Badge tone="violet" icon={<Megaphone className="size-3" aria-hidden />}>{label}</Badge>;
}

/** Verified badge appears only for status === 'verified'. */
export function VerificationBadge({ status, compact }: { status: Verification; compact?: boolean }) {
  if (status === 'verified') return <Badge tone="teal" icon={<BadgeCheck className="size-3.5" aria-hidden />}>Verified</Badge>;
  if (compact) return null;
  const map: Record<Exclude<Verification, 'verified'>, [string, Tone]> = {
    unverified: ['Not verified', 'gray'], submitted: ['Verification submitted', 'blue'], under_review: ['Under review', 'blue'], rejected: ['Verification rejected', 'red'], suspended: ['Suspended', 'red']
  };
  const [label, tone] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Rating({ value, count, size = 'sm' }: { value: number; count?: number; size?: 'sm' | 'md' }) {
  return (
    <span className={cx('inline-flex items-center gap-1 font-semibold text-ink', size === 'md' ? 'text-base' : 'text-sm')} aria-label={`Rated ${value.toFixed(1)} out of 5${count !== undefined ? ` from ${count} reviews` : ''}`}>
      <Star className={cx('fill-amber text-amber', size === 'md' ? 'size-5' : 'size-4')} aria-hidden />
      {value.toFixed(1)}
      {count !== undefined && <span className="font-normal text-muted">({count})</span>}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="p-1">
          <Star className={cx('size-7', n <= value ? 'fill-amber text-amber' : 'text-line')} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const initials = name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span className={cx('inline-grid shrink-0 place-items-center rounded-full font-semibold text-white', className)} style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 38%)` }} aria-hidden>
      {initials || '?'}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('grid gap-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card p-4 flex gap-3">
          <Skeleton className="size-14 shrink-0 rounded-lg" />
          <div className="flex-1 grid gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center grid justify-items-center gap-2">
      <div className="size-12 grid place-items-center rounded-full bg-navy-50 text-navy">{icon ?? <Info className="size-6" aria-hidden />}</div>
      <h3 className="font-semibold text-ink">{title}</h3>
      {text && <p className="text-sm text-muted max-w-sm">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', title, children, className }: { tone?: 'info' | 'warning' | 'demo' | 'danger' | 'success'; title?: string; children: ReactNode; className?: string }) {
  const styles = {
    info: ['bg-navy-50 border-navy-100 text-navy', Info], warning: ['bg-amber-50 border-amber/30 text-amber-700', CircleAlert], demo: ['bg-amber-50 border-amber/30 text-amber-700', FlaskConical],
    danger: ['bg-danger-50 border-danger/20 text-danger', ShieldAlert], success: ['bg-teal-50 border-teal/20 text-teal', BadgeCheck]
  } as const;
  const [cls, I] = styles[tone];
  return (
    <div className={cx('flex gap-3 rounded-xl border p-3 text-sm', cls, className)} role={tone === 'danger' ? 'alert' : undefined}>
      <I className="size-5 shrink-0 mt-0.5" aria-hidden />
      <div className="text-ink/90">{title && <p className="font-semibold text-ink">{title}</p>}{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, badge }: { title: string; subtitle?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-navy tracking-tight">{title}</h1>{badge}</div>
        {subtitle && <p className="text-muted mt-1 text-[15px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, to, linkLabel = 'See all', icon }: { title: string; to?: string; linkLabel?: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 className="flex items-center gap-2 text-lg font-bold text-navy">{icon}{title}</h2>
      {to && <Link to={to} className="text-sm font-semibold text-teal hover:underline">{linkLabel} →</Link>}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-muted text-sm">{label}{icon}</div>
      <div className="mt-1 text-2xl font-bold text-navy">{value}</div>
      {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

const GRADIENTS = ['from-navy to-teal', 'from-teal to-emerald-600', 'from-navy-deep to-indigo-700', 'from-amber-700 to-amber', 'from-indigo-700 to-sky-600', 'from-rose-700 to-orange-500', 'from-emerald-700 to-lime-600', 'from-slate-700 to-slate-500'];

/** Image placeholder: a deterministic gradient with an icon. No stock photos are fabricated. */
export function ImagePlaceholder({ seed, icon, className, label }: { seed: string; icon?: ReactNode; className?: string; label?: string }) {
  const i = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  return (
    <div role="img" aria-label={label ?? 'Image placeholder'} className={cx('relative grid place-items-center bg-gradient-to-br text-white/90 overflow-hidden', GRADIENTS[i], className)}>
      {icon}
    </div>
  );
}

export function KeyValue({ items }: { items: Array<[string, ReactNode] | false | null | undefined | ''> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
      {items.filter(Boolean).map((kv) => {
        const [k, v] = kv as [string, ReactNode];
        return <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>;
      })}
    </dl>
  );
}

export function StatusPill({ status }: { status: string }) {
  const s = status.replace(/_/g, ' ');
  const tone: Tone = /reject|cancel|fail|declin|withdrawn|suspend|removed|expired|flag/.test(status) ? 'red'
    : /complete|select|approved|live|verified|confirmed|success|resolved|actioned|active|open|arranged|sold|refunded|published/.test(status) ? 'teal'
    : /pending|review|submitted|scheduled|shortlist|interview|respond|sourcing|coordinat|received|claimed|draft|new/.test(status) ? 'blue' : 'gray';
  return <Badge tone={tone} className="capitalize">{s}</Badge>;
}

export function MetaLine({ children }: { children: ReactNode }) {
  return <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">{children}</p>;
}

export function Dot() {
  return <span aria-hidden className="text-line">•</span>;
}

export function TimeMeta({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" aria-hidden />{children}</span>;
}
