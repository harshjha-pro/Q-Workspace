import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Droplet,
  ExternalLink,
  FlaskConical,
  HeartPulse,
  Home as HomeIcon,
  Info,
  Leaf,
  Search,
  Share2,
  ShowerHead,
  Smile,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SOURCE_MAP, STATUS_LABEL } from '../data';
import type { EvidenceLevel, ReviewStatus } from '../data/types';
import { type SavedType, useStore } from '../lib/store';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  droplet: Droplet,
  wind: Wind,
  smile: Smile,
  'shower-head': ShowerHead,
  'flask-conical': FlaskConical,
  leaf: Leaf,
  home: HomeIcon,
  'heart-pulse': HeartPulse,
};

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={cx('rounded-2xl border border-line bg-white shadow-card', className)}>{children}</As>;
}

export function Chip({ active, children, onClick, className }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors',
        active ? 'border-forest-700 bg-forest-700 text-white' : 'border-line bg-white text-ink-soft hover:border-forest-200 hover:bg-forest-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Tag({ children, tone = 'green', className }: { children: ReactNode; tone?: 'green' | 'neutral' | 'amber' | 'rose'; className?: string }) {
  const tones = {
    green: 'bg-forest-50 text-forest-700 border-forest-100',
    neutral: 'bg-ivory-100 text-ink-muted border-line',
    amber: 'bg-amberx-50 text-amberx-700 border-[#EBDDB5]',
    rose: 'bg-rosex-50 text-rosex-700 border-[#EDCFC8]',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium', tones[tone], className)}>{children}</span>;
}

export const EVIDENCE_META: Record<EvidenceLevel, { label: string; tone: 'green' | 'neutral' | 'amber' | 'rose'; description: string }> = {
  established: { label: 'Established evidence', tone: 'green', description: 'Consistent evidence from regulators, guidelines or multiple good-quality studies.' },
  moderate: { label: 'Moderate evidence', tone: 'green', description: 'Supportive controlled studies, with gaps or limited size.' },
  preliminary: { label: 'Preliminary evidence', tone: 'amber', description: 'Small, early, lab or animal studies. Promising but unconfirmed.' },
  traditional: { label: 'Traditional use', tone: 'neutral', description: 'Long-standing traditional use, not established by controlled research.' },
  insufficient: { label: 'Insufficient evidence', tone: 'neutral', description: 'Little or no reliable evidence either way.' },
  unsupported: { label: 'Not supported', tone: 'rose', description: 'Evidence contradicts the claim, or the practice carries clear risk.' },
};

export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  const m = EVIDENCE_META[level];
  return (
    <Tag tone={m.tone}>
      <span title={m.description}>{m.label}</span>
    </Tag>
  );
}

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const tone = status === 'published' || status === 'reviewed' ? 'green' : status === 'needs_verification' ? 'amber' : 'neutral';
  return <Tag tone={tone}>{STATUS_LABEL[status]}</Tag>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function LinkAction({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-[13px] font-medium text-forest-600 hover:text-forest-800">
      {children}
    </Link>
  );
}

export function BackButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}
      className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-ivory-100"
      aria-label="Go back"
    >
      <ArrowLeft size={20} />
    </button>
  );
}

export function PageHeader({ title, subtitle, back = true, actions, children }: { title?: ReactNode; subtitle?: ReactNode; back?: boolean; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-5">
      <div className="flex min-h-[44px] items-center gap-2">
        {back && <BackButton />}
        <div className="flex-1" />
        {actions}
        <Link to="/search" className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-ivory-100 lg:hidden" aria-label="Search">
          <Search size={20} />
        </Link>
      </div>
      {title && <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>}
      {subtitle && <p className="mt-1 text-[14px] text-ink-muted">{subtitle}</p>}
      {children}
    </header>
  );
}

export function SaveButton({ type, id, label }: { type: SavedType; id: string; label?: string }) {
  const { isSaved, toggleSaved } = useStore();
  const saved = isSaved(type, id);
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      onClick={() => toggleSaved(type, id, label)}
      className={cx('grid h-11 w-11 place-items-center rounded-full hover:bg-ivory-100', saved ? 'text-forest-700' : 'text-ink')}
      aria-label={saved ? 'Remove from saved' : 'Save'}
      aria-pressed={saved}
    >
      <Icon size={20} fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* user cancelled share sheet */
    }
  };
  return (
    <button type="button" onClick={share} className="relative grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-ivory-100" aria-label="Share">
      <Share2 size={19} />
      {copied && <span className="absolute top-11 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-white">Link copied</span>}
    </button>
  );
}

export function EmptyState({ icon: Icon = Info, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-white/60 px-5 py-8 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-forest-50 text-forest-600">
        <Icon size={20} />
      </div>
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-sm text-[13.5px] text-ink-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  className,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
}) {
  const v = {
    primary: 'bg-forest-700 text-white hover:bg-forest-800',
    secondary: 'border border-line bg-white text-ink hover:bg-ivory-100',
    ghost: 'text-forest-700 hover:bg-forest-50',
    danger: 'border border-[#EDCFC8] bg-white text-rosex-700 hover:bg-rosex-50',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx('inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-medium transition-colors disabled:opacity-50', v[variant], className)}
    >
      {children}
    </button>
  );
}

export function ListRow({ to, icon, title, subtitle, right }: { to: string; icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <Link to={to} className="flex min-h-[56px] items-center gap-3 px-4 py-3 hover:bg-ivory-100/60">
      {icon && <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-50 text-forest-700">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-ink">{title}</div>
        {subtitle && <div className="truncate text-[12.5px] text-ink-muted">{subtitle}</div>}
      </div>
      {right ?? <ChevronRight size={18} className="shrink-0 text-ink-faint" />}
    </Link>
  );
}

export function SourceList({ ids, lastReviewed, label = 'Last reviewed' }: { ids: string[]; lastReviewed?: string; label?: string }) {
  const sources = ids.map((id) => SOURCE_MAP[id]).filter(Boolean);
  return (
    <div className="space-y-2">
      {lastReviewed && (
        <p className="text-[12.5px] text-ink-muted">
          {label}: <time dateTime={lastReviewed}>{formatDate(lastReviewed)}</time>
        </p>
      )}
      {sources.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No sources attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li key={s.id} className="text-[13px] leading-snug">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 font-medium text-forest-700 hover:underline">
                  {s.publisher} <ExternalLink size={12} className="mt-1 shrink-0" />
                </a>
              ) : (
                <span className="font-medium text-ink">{s.publisher}</span>
              )}
              <span className="block text-ink-muted">{s.title}</span>
              {s.note && <span className="block text-[12px] text-ink-faint">{s.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'danger'; title?: string; children: ReactNode }) {
  const styles = {
    info: 'border-forest-100 bg-forest-50 text-forest-800',
    warn: 'border-[#EBDDB5] bg-amberx-50 text-amberx-700',
    danger: 'border-[#EDCFC8] bg-rosex-50 text-rosex-700',
  };
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-[13px] leading-relaxed', styles[tone])} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function DemoNotice() {
  return (
    <Notice tone="warn" title="Fictional demonstration record">
      This product, its brand, formulation and price are invented for demonstration. It is not a real product and is not available to buy.
    </Notice>
  );
}

export function BulletList({ items, tone = 'neutral' }: { items?: string[]; tone?: 'neutral' | 'warn' }) {
  if (!items?.length) return <p className="text-[13.5px] text-ink-muted">Nothing recorded.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-[14px] leading-relaxed text-ink-soft">
          <span className={cx('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', tone === 'warn' ? 'bg-amberx-700' : 'bg-forest-500')} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-forest-200 border-t-forest-700" role="status" aria-label="Loading" />;
}
