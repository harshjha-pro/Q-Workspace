import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Small server-rendered charts (no chart library; D-87). Conventions from the data-viz guide:
 * - one hue for magnitude, categorical slots in fixed order, reserved status colours always labelled;
 * - thin marks with 4px rounded data ends, value at the tip, recessive grid;
 * - text never wears the series colour; every chart has a hover title and a "Show as table" view.
 */

export function StatTile({ label, value, sub, href, tone }: { label: string; value: string; sub?: string; href?: string; tone?: "warn" | "bad" }) {
  const body = (
    <div className={cn("rounded-lg border bg-surface p-3 shadow-sm", tone === "bad" ? "border-red-200" : tone === "warn" ? "border-amber-200" : "border-line", href && "hover:bg-gray-50")}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>;
}

function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted">Show as table</summary>
      <table className="mt-1 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} className="border-b border-line py-1 pr-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cn("border-b border-line py-1 pr-2", j > 0 && "tabular-nums")}>{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

/** Horizontal bars for "compare magnitude" (single series, one hue). */
export function BarList({ title, rows, unit = "", empty = "No data for this period." }: { title: string; rows: { label: string; value: number; display?: string; href?: string }[]; unit?: string; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <figure aria-label={title}>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const text = r.display ?? `${r.value.toLocaleString("en-IN")}${unit}`;
          const label = r.href ? <Link className="hover:underline" href={r.href}>{r.label}</Link> : r.label;
          return (
            <li key={r.label} className="group grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-2 text-xs sm:grid-cols-[minmax(0,14rem)_1fr]" title={`${r.label}: ${text}`}>
              <span className="truncate text-ink">{label}</span>
              <span className="flex items-center gap-2">
                <span className="h-3 rounded-r-[4px] bg-viz-1 transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(1, (r.value / max) * 85)}%` }} />
                <span className="shrink-0 tabular-nums text-muted">{text}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <TableView caption={title} head={["Item", "Value"]} rows={rows.map((r) => [r.label, r.display ?? `${r.value}${unit}`])} />
    </figure>
  );
}

type Series = { name: string; values: (number | null)[]; format: (v: number) => string };

/** Monthly columns: one series, or two of the same unit side by side (legend shown for two). */
export function Columns({ title, labels, series, height = 140 }: { title: string; labels: string[]; series: Series[]; height?: number }) {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(...all, 1);
  const n = labels.length;
  const W = 640;
  const H = height;
  const pad = { l: 4, r: 4, t: 18, b: 20 };
  const band = (W - pad.l - pad.r) / n;
  const barW = Math.min(24, (band - 6) / series.length);
  const colors = ["var(--color-viz-1)", "var(--color-viz-2)", "var(--color-viz-3)"];
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const lastIdx = n - 1;
  return (
    <figure aria-label={title}>
      {series.length > 1 ? (
        <div className="mb-1 flex gap-3 text-xs text-muted">{series.map((s, i) => <span key={s.name} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />{s.name}</span>)}</div>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--color-viz-grid)" strokeWidth={1} />
        {labels.map((lab, i) => {
          const cx = pad.l + band * i + band / 2;
          return (
            <g key={lab}>
              {series.map((s, k) => {
                const v = s.values[i];
                if (v === null || v === undefined) return null;
                const x = cx - (barW * series.length) / 2 + k * barW + (series.length > 1 ? 1 : 0);
                const top = y(v);
                const h = Math.max(0, H - pad.b - top);
                const w = barW - (series.length > 1 ? 2 : 0);
                const r = Math.min(4, h, w / 2);
                return (
                  <g key={s.name} className="opacity-100 transition-opacity hover:opacity-80">
                    <title>{`${lab} · ${s.name}: ${s.format(v)}`}</title>
                    {/* 4px rounded data end, square at the baseline */}
                    <path d={`M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${H - pad.b} Z`} fill={colors[k]} />
                    <rect x={x - 2} y={pad.t} width={w + 4} height={H - pad.t - pad.b} fill="transparent" />
                  </g>
                );
              })}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-muted)">{lab}</text>
              {/* Selective direct label: the latest month only. */}
              {i === lastIdx && series[0]!.values[i] !== null ? <text x={cx} y={y(series[0]!.values[i]!) - 4} textAnchor="middle" fontSize={10} fill="var(--color-ink)">{series[0]!.format(series[0]!.values[i]!)}</text> : null}
            </g>
          );
        })}
      </svg>
      <TableView caption={title} head={["Month", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => (s.values[i] === null ? "—" : s.format(s.values[i]!)))])} />
    </figure>
  );
}

const STATUS = { good: "var(--color-status-good)", warning: "var(--color-status-warning)", serious: "var(--color-status-serious)", critical: "var(--color-status-critical)", neutral: "var(--color-viz-grid)" } as const;

/** Part-to-whole of a state (e.g. on time / late / overdue / upcoming), status colours with a labelled legend. */
export function StatusBar({ title, parts }: { title: string; parts: { label: string; value: number; status: keyof typeof STATUS }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return <p className="text-sm text-muted">Nothing in this period.</p>;
  return (
    <figure aria-label={title}>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: STATUS[p.status] }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
        {parts.map((p) => <li key={p.label} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS[p.status] }} />{p.label} <span className="tabular-nums text-muted">{p.value}</span></li>)}
      </ul>
    </figure>
  );
}

/** A single ratio against a limit (budget burn). The fill keeps one hue; the band is stated in words beside it. */
export function Meter({ label, percent, note }: { label: string; percent: number | null; note: string }) {
  const p = percent ?? 0;
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-ink">{label}</span><span className="tabular-nums text-muted">{percent === null ? "No budget" : `${percent}% · ${note}`}</span></div>
      <div className="mt-1 h-2.5 w-full rounded-[4px] bg-viz-grid" title={percent === null ? "No budget" : `${percent}% of budget`}>
        <div className="h-full rounded-[4px] bg-viz-1" style={{ width: `${Math.min(100, p)}%` }} />
      </div>
    </div>
  );
}
