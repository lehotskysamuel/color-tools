import { JND, oklabToOklch } from '../color/oklab';
import type { Paint } from './vallejo';

/**
 * The orders the "Sort by" select offers. `printed` keeps a layout's own order: a chart as its maker prints it, a
 * set as it is stored.
 */
export type SortOrder = 'code' | 'hue' | 'value' | 'valueHue' | 'hueValue' | 'printed';

export const SORT_ORDERS: readonly { id: SortOrder; label: string; note: string }[] = [
  { id: 'code', label: 'Color code', note: 'by code' },
  { id: 'hue', label: 'Hue', note: 'by hue, the grays last' },
  { id: 'value', label: 'Value', note: 'by lightness, the lightest first' },
  { id: 'valueHue', label: 'Value, then hue', note: 'one row per tenth of lightness, each by hue' },
  { id: 'hueValue', label: 'Hue, then value', note: 'one row per tenth of the hue circle, each by lightness' },
  { id: 'printed', label: 'As printed', note: '' },
];

export const DEFAULT_SORT: SortOrder = 'code';

/** Two-level sorts split the paints into this many buckets of lightness or of the hue circle. */
export const BUCKETS = 10;

/** Below this chroma, half a just-noticeable difference from gray, a paint's hue is noise: it sorts as a gray. */
export const NEUTRAL_CHROMA = JND / 2;

export function isSortOrder(value: unknown): value is SortOrder {
  return SORT_ORDERS.some((o) => o.id === value);
}

/**
 * By code ascending. Every code is "NN.NNN", so comparing them as strings orders them by number. Paints
 * without a code (Kimera Kolors) come last, by name.
 */
export function byCode(p: Paint, q: Paint): number {
  if (p.code && q.code) return p.code < q.code ? -1 : p.code > q.code ? 1 : 0;
  if (p.code || q.code) return p.code ? -1 : 1;
  return p.name.localeCompare(q.name);
}

/**
 * The paints in the given order, in groups: a two-level sort gives one group per non-empty bucket, the lightest
 * or the first hue first, and every other order a single group. Grays have no hue, so a hue sort puts them after
 * the colors (in a group of their own for "Hue, then value"), and within a lightness bucket after its colors.
 * Lightness always goes from light to dark. Ties fall back to code order, so the result is stable.
 */
export function sortPaints(paints: readonly Paint[], order: SortOrder): Paint[][] {
  if (order === 'printed') return [[...paints]];
  const lch = new Map(paints.map((p) => [p, oklabToOklch(p.lab)]));
  const L = (p: Paint) => lch.get(p)![0];
  const gray = (p: Paint) => lch.get(p)![1] < NEUTRAL_CHROMA;
  const hue = (p: Paint) => lch.get(p)![2];
  const byValue = (p: Paint, q: Paint) => L(q) - L(p) || byCode(p, q);
  const byHue = (p: Paint, q: Paint) =>
    Number(gray(p)) - Number(gray(q)) || (gray(p) ? byValue(p, q) : hue(p) - hue(q) || byCode(p, q));
  const bucket = (x: number, range: number) => Math.min(BUCKETS - 1, Math.max(0, Math.floor((x / range) * BUCKETS)));

  const sorted = (compare: (p: Paint, q: Paint) => number) => [...paints].sort(compare);
  switch (order) {
    case 'code':
      return [sorted(byCode)];
    case 'hue':
      return [sorted(byHue)];
    case 'value':
      return [sorted(byValue)];
    case 'valueHue':
      // The lightest bucket first.
      return groups(sorted(byHue), (p) => BUCKETS - 1 - bucket(L(p), 1));
    case 'hueValue':
      // The grays after the last hue bucket.
      return groups(sorted(byValue), (p) => (gray(p) ? BUCKETS : bucket(hue(p), 360)));
  }
}

/** Splits already sorted paints by key, in ascending key order, keeping their order within each group. */
function groups(paints: Paint[], key: (p: Paint) => number): Paint[][] {
  const byKey = new Map<number, Paint[]>();
  for (const p of paints) {
    const k = key(p);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(p);
  }
  return [...byKey].sort(([a], [b]) => a - b).map(([, group]) => group);
}
