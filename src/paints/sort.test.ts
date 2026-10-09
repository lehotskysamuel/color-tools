import { describe, expect, it } from 'vitest';
import { oklabToOklch } from '../color/oklab';
import { BUCKETS, NEUTRAL_CHROMA, SORT_ORDERS, sortPaints } from './sort';
import { type Paint, PAINTS } from './vallejo';

const ALL = [...PAINTS.values()];
const lch = (p: Paint) => oklabToOklch(p.lab);
const gray = (p: Paint) => lch(p)[1] < NEUTRAL_CHROMA;
const ids = (paints: Paint[]) => paints.map((p) => p.id);
const bucket = (x: number, range: number) => Math.min(BUCKETS - 1, Math.floor((x / range) * BUCKETS));

describe('sortPaints', () => {
  it('keeps every paint exactly once, whatever the order', () => {
    for (const { id } of SORT_ORDERS) {
      const sorted = sortPaints(ALL, id).flat();
      expect(sorted).toHaveLength(ALL.length);
      expect(new Set(sorted).size).toBe(ALL.length);
    }
  });

  it('sorts by code, paints without one last by name', () => {
    const [sorted] = sortPaints(ALL, 'code');
    expect(ids(sortPaints([PAINTS.get('72.101')!, PAINTS.get('The White')!, PAINTS.get('72.001')!], 'code')[0])).toEqual([
      '72.001',
      '72.101',
      'The White',
    ]);
    const coded = sorted.filter((p) => p.code);
    expect(sorted.slice(0, coded.length)).toEqual(coded);
    expect(coded.map((p) => p.code)).toEqual(coded.map((p) => p.code!).sort());
  });

  it('sorts by lightness, the lightest first', () => {
    const [sorted] = sortPaints(ALL, 'value');
    for (let i = 1; i < sorted.length; i++) expect(lch(sorted[i])[0]).toBeLessThanOrEqual(lch(sorted[i - 1])[0]);
  });

  it('sorts by hue, the grays last by lightness', () => {
    const [sorted] = sortPaints(ALL, 'hue');
    const colors = sorted.filter((p) => !gray(p));
    expect(sorted.slice(0, colors.length)).toEqual(colors);
    for (let i = 1; i < colors.length; i++) expect(lch(colors[i])[2]).toBeGreaterThanOrEqual(lch(colors[i - 1])[2]);
    const grays = sorted.slice(colors.length);
    expect(grays.length).toBeGreaterThan(0);
    for (let i = 1; i < grays.length; i++) expect(lch(grays[i])[0]).toBeLessThanOrEqual(lch(grays[i - 1])[0]);
  });

  it('splits value, then hue into tenths of lightness, the lightest first, each by hue', () => {
    const groups = sortPaints(ALL, 'valueHue');
    const keys = groups.map((g) => new Set(g.map((p) => bucket(lch(p)[0], 1))));
    for (const k of keys) expect(k.size).toBe(1);
    const order = keys.map((k) => [...k][0]);
    expect(order).toEqual([...order].sort((a, b) => b - a));
    for (const group of groups) {
      const colors = group.filter((p) => !gray(p));
      expect(group.slice(0, colors.length)).toEqual(colors);
      for (let i = 1; i < colors.length; i++) expect(lch(colors[i])[2]).toBeGreaterThanOrEqual(lch(colors[i - 1])[2]);
    }
  });

  it('splits hue, then value into tenths of the hue circle and the grays, each by lightness', () => {
    const groups = sortPaints(ALL, 'hueValue');
    const grays = groups.at(-1)!;
    expect(grays.every(gray)).toBe(true);
    const order = groups.slice(0, -1).map((g) => {
      const k = new Set(g.map((p) => (gray(p) ? -1 : bucket(lch(p)[2], 360))));
      expect(k.size).toBe(1);
      return [...k][0];
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const group of groups) {
      for (let i = 1; i < group.length; i++) expect(lch(group[i])[0]).toBeLessThanOrEqual(lch(group[i - 1])[0]);
    }
  });

  it('keeps the given order as printed', () => {
    const some = ALL.slice(0, 20).reverse();
    expect(sortPaints(some, 'printed')).toEqual([some]);
  });
});
