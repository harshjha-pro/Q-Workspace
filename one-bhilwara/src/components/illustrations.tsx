/* Original vector illustrations used instead of photos (no stock or real-place photos are
   presented as Bhilwara). Deterministic variations come from a string seed. */
import { cx } from './ui/primitives';

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const SKIES = [
  ['#1d4ed8', '#f59e0b'], ['#0f1d40', '#fb923c'], ['#2563eb', '#fde68a'], ['#7c3aed', '#f97316'], ['#0e7490', '#fcd34d'], ['#1e3a8a', '#f472b6']
];

/** Rajasthani palace / city skyline at golden hour. */
export function CityScene({ seed = 'city', className, label = 'Illustration of a Rajasthani palace skyline' }: { seed?: string; className?: string; label?: string }) {
  const h = hash(seed);
  const [top, bottom] = SKIES[h % SKIES.length];
  const id = `cs${h}`;
  const sunX = 60 + (h % 180);
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className={cx('block', className)} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={top} /><stop offset="1" stopColor={bottom} /></linearGradient>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={bottom} stopOpacity=".55" /><stop offset="1" stopColor={top} stopOpacity=".9" /></linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${id}s)`} />
      <circle cx={sunX} cy="70" r="22" fill="#fff7d6" opacity=".85" />
      {/* distant hills */}
      <path d="M0 118 Q40 96 80 112 T170 106 T260 110 T320 100 V140 H0Z" fill="#0f1d40" opacity=".25" />
      {/* palace */}
      <g fill="#3b1f4a" opacity=".92">
        <rect x="150" y="88" width="120" height="44" />
        <rect x="170" y="70" width="80" height="20" />
        <rect x="196" y="54" width="28" height="18" />
        <path d="M196 54 Q210 34 224 54Z" />
        <path d="M168 70 Q178 56 188 70Z" /><path d="M232 70 Q242 56 252 70Z" />
        <rect x="140" y="80" width="14" height="52" /><path d="M138 80 Q147 66 156 80Z" />
        <rect x="266" y="80" width="14" height="52" /><path d="M264 80 Q273 66 282 80Z" />
        <rect x="40" y="100" width="70" height="32" /><path d="M58 100 Q75 84 92 100Z" />
        <rect x="20" y="108" width="12" height="24" /><path d="M18 108 Q26 98 34 108Z" />
      </g>
      <g fill="#fde68a" opacity=".75">
        {[160, 176, 192, 208, 224, 240, 256].map((x) => <rect key={x} x={x} y="100" width="5" height="9" rx="2.5" />)}
        {[180, 200, 220, 236].map((x) => <rect key={x} x={x} y="76" width="4" height="7" rx="2" />)}
        {[52, 68, 84, 98].map((x) => <rect key={x} x={x} y="110" width="4" height="8" rx="2" />)}
      </g>
      {/* lake */}
      <rect y="132" width="320" height="48" fill={`url(#${id}w)`} />
      <g stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round">
        <path d="M30 148 H70" /><path d="M150 156 H210" /><path d="M240 146 H290" /><path d="M90 166 H130" />
      </g>
    </svg>
  );
}

const WALLS = ['#fde7d4', '#e0ecff', '#e8f6ec', '#f3e8ff', '#fff4d6'];

/** Simple interior scene for property listings. */
export function RoomScene({ seed = 'room', className, kind = 'living' }: { seed?: string; className?: string; kind?: 'living' | 'bed' | 'shop' }) {
  const h = hash(seed);
  const wall = WALLS[h % WALLS.length];
  return (
    <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" className={cx('block', className)} role="img" aria-label="Illustration of a room">
      <rect width="160" height="120" fill={wall} />
      <rect y="86" width="160" height="34" fill="#c08a5b" />
      <path d="M0 86 H160" stroke="#9a6a40" strokeWidth="2" />
      <rect x="18" y="20" width="44" height="38" rx="3" fill="#bfe0ff" stroke="#fff" strokeWidth="4" />
      <path d="M40 20 V58 M18 39 H62" stroke="#fff" strokeWidth="3" />
      {kind === 'bed' ? (
        <g><rect x="70" y="62" width="76" height="26" rx="4" fill="#6b7fd7" /><rect x="70" y="54" width="22" height="12" rx="3" fill="#fff" /><rect x="68" y="48" width="6" height="40" rx="2" fill="#7a4e2d" /></g>
      ) : kind === 'shop' ? (
        <g><rect x="72" y="40" width="72" height="48" fill="#7a4e2d" /><rect x="78" y="46" width="60" height="8" fill="#f59e0b" /><rect x="78" y="60" width="60" height="8" fill="#60a5fa" /><rect x="78" y="74" width="60" height="8" fill="#34d399" /></g>
      ) : (
        <g><rect x="74" y="62" width="70" height="20" rx="6" fill="#2563eb" /><rect x="72" y="54" width="74" height="12" rx="6" fill="#3b82f6" /><rect x="74" y="80" width="4" height="8" fill="#1e293b" /><rect x="140" y="80" width="4" height="8" fill="#1e293b" />
          <circle cx="126" cy="30" r="9" fill="#fef3c7" /><path d="M126 39 V54" stroke="#475569" strokeWidth="2" /></g>
      )}
      <rect x="6" y="66" width="10" height="20" rx="2" fill="#16a34a" /><circle cx="11" cy="62" r="7" fill="#22c55e" />
    </svg>
  );
}

const SKIN = ['#c68642', '#8d5524', '#e0ac69', '#a1665e'];
const SHIRT = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0e7490', '#be123c'];

/** Friendly worker portrait for service providers (not a real person). */
export function WorkerPortrait({ seed = 'w', className, tool = '🔧' }: { seed?: string; className?: string; tool?: string }) {
  const h = hash(seed);
  const bg = ['#e0ecff', '#fde7d4', '#e8f6ec', '#f3e8ff'][h % 4];
  return (
    <svg viewBox="0 0 100 100" className={cx('block', className)} role="img" aria-label="Illustrated provider portrait">
      <rect width="100" height="100" fill={bg} />
      <path d="M18 100 Q20 70 50 68 Q80 70 82 100Z" fill={SHIRT[h % SHIRT.length]} />
      <circle cx="50" cy="44" r="18" fill={SKIN[h % SKIN.length]} />
      <path d="M31 40 Q33 22 50 22 Q67 22 69 40 Q60 31 50 32 Q40 31 31 40Z" fill="#1f2937" />
      {h % 2 === 0 && <path d="M30 36 Q50 16 70 36 L72 38 H28Z" fill="#f59e0b" />}
      <circle cx="43" cy="45" r="2" fill="#1f2937" /><circle cx="57" cy="45" r="2" fill="#1f2937" />
      <path d="M44 53 Q50 57 56 53" stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
      <text x="78" y="92" fontSize="20" textAnchor="middle">{tool}</text>
    </svg>
  );
}
