// ---------------------------------------------------------------------------
// Chart primitives — shared types, palette and scale helpers
//
// The palette is not decorative. Every set below was run through the data-viz
// validator (OKLCH lightness band, chroma floor, protan/deutan ΔE separation,
// normal-vision ΔE floor, WCAG contrast against the #ffffff card surface) and
// only passing sets were kept. The slot ORDER is the colour-blind-safety
// mechanism — reordering a set invalidates it, so add new series at the end and
// re-validate rather than shuffling.
//
// Status/semantic colours are reserved: they are only used where the colour
// *means* the state, never as a "next series" colour.
// ---------------------------------------------------------------------------

/** Eight-hue categorical theme. Assign in order; never cycle past slot 8. */
export const VIZ_SLOT = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
  magenta: '#e87ba4',
  green: '#008300',
  violet: '#4a3aa7',
  red: '#e34948'
} as const;

/** Chart chrome. Deliberately one step off the surface so the data stays loudest. */
export const VIZ_INK = {
  surface: '#ffffff',
  primary: '#272b34',
  secondary: '#4a5264',
  muted: '#70798c',
  faint: '#8b93a4',
  grid: '#eceef2',
  axis: '#d5dae2',
  /** Sparkline history / "everything that is not the point" grey. */
  deemphasis: '#c4cad4'
} as const;

/**
 * Subscription status ring. Validated as an adjacent set in exactly this order
 * (worst adjacent CVD ΔE 15.3, normal-vision ΔE 20.8). NONE is the absence
 * slot — grey on purpose, and outside the categorical gates because an absence
 * is not a series.
 */
export const STATUS_COLOR: Record<string, string> = {
  ACTIVE: VIZ_SLOT.green,
  UPCOMING: VIZ_SLOT.blue,
  SUSPENDED: VIZ_SLOT.yellow,
  EXPIRED: VIZ_SLOT.red,
  UNSUBSCRIBED: VIZ_SLOT.violet,
  NONE: '#8b93a4'
};

/** Paid vs trial. Two hues, validated all-pairs. */
export const BILLING_COLOR: Record<string, string> = {
  PAID: VIZ_SLOT.blue,
  TRIAL: VIZ_SLOT.orange
};

/** Lifecycle trend lines. Three slots, validated all-pairs (worst CVD ΔE 9.2). */
export const TREND_COLOR = {
  NEW: VIZ_SLOT.blue,
  CHURNED: VIZ_SLOT.orange,
  REACTIVATED: VIZ_SLOT.aqua
} as const;

/**
 * Expiry runway — an ordinal ramp, not a categorical set: the buckets have a
 * natural order and the colour carries urgency (semantic heat), darkest first.
 * Validated with the ordinal gates (monotone L, ΔL ≥ 0.06, light end 2.36:1).
 */
export const EXPIRY_RAMP = ['#7a2e08', '#a34010', '#c8551d', '#e0702f', '#f0915c'] as const;

/** Above/below baseline. Warm/cool poles with a neutral grey midpoint. */
export const DIVERGING = { up: VIZ_SLOT.blue, down: VIZ_SLOT.red, mid: VIZ_INK.axis } as const;

/** Reserved semantic tones — only ever used where the colour *means* the state. */
export const SEMANTIC = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b'
} as const;

// --- shapes ----------------------------------------------------------------

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Optional right-hand context, e.g. "32% of book". */
  note?: string;
}

/** One row of a chart's table-view twin. */
export interface TableRow {
  label: string;
  values: (string | number)[];
  color?: string;
}

// --- scale helpers ---------------------------------------------------------

/**
 * Axis ticks on round numbers. A tick list of 0 / 5 / 10 is readable; 0 / 3.7 /
 * 7.4 is not, and the ceiling has to sit above the tallest mark or the bar
 * runs into the top of the plot.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rawStep = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks.length < 2) ticks.push(step);
  if (ticks[ticks.length - 1] < max) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 1000) / 1000);
  return ticks;
}

/** 1,284 → "1,284"; 12,900 → "12.9K". Used on marks, never in table cells. */
export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString('en-US');
}

export function percent(value: number, total: number): string {
  if (!total) return '0%';
  const pct = (value / total) * 100;
  return `${pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/** Cartesian point on a circle, 12 o'clock = 0°, clockwise. */
export function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Arc path for a donut segment (outer radius r, ring thickness `thickness`). */
export function arcPath(cx: number, cy: number, r: number, thickness: number, startDeg: number, endDeg: number): string {
  const inner = r - thickness;
  // A full ring cannot be drawn as one arc — start and end coincide, so the
  // renderer draws nothing at all. Stop it just shy of 360°.
  const end = endDeg - startDeg >= 360 ? startDeg + 359.99 : endDeg;
  const largeArc = end - startDeg > 180 ? 1 : 0;
  const p1 = polar(cx, cy, r, startDeg);
  const p2 = polar(cx, cy, r, end);
  const p3 = polar(cx, cy, inner, end);
  const p4 = polar(cx, cy, inner, startDeg);
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z'
  ].join(' ');
}

/**
 * Rounded at the data end only, square at the baseline — the baseline edge is
 * where a bar is measured from, so rounding it would fake the zero point.
 */
export function barPath(x: number, y: number, w: number, h: number, radius: number, direction: 'up' | 'down' | 'right'): string {
  if (h <= 0 || w <= 0) return '';
  const r = Math.max(0, Math.min(radius, h / 2, w / 2));
  if (direction === 'up') {
    return `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} Z`;
  }
  if (direction === 'down') {
    return `M ${x} ${y} L ${x} ${y + h - r} Q ${x} ${y + h} ${x + r} ${y + h} L ${x + w - r} ${y + h} Q ${x + w} ${y + h} ${x + w} ${y + h - r} L ${x + w} ${y} Z`;
  }
  return `M ${x} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x} ${y + h} Z`;
}

/** Catmull-Rom → cubic Bézier. Readable trend line without inventing peaks. */
export function smoothPath(points: { x: number; y: number }[], tension = 0.3): string {
  if (points.length === 0) return '';
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + ((p2.x - p0.x) / 6) * tension * 2, y: p1.y + ((p2.y - p0.y) / 6) * tension * 2 };
    const c2 = { x: p2.x - ((p3.x - p1.x) / 6) * tension * 2, y: p2.y - ((p3.y - p1.y) / 6) * tension * 2 };
    d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}
