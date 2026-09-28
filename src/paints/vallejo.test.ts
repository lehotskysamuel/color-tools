import { describe, expect, it } from 'vitest';
import catalog from '../../data/vallejo.json';
import { oklabToHex, oklabToOklch } from '../color/oklab';
import { LAYOUTS, PAINTS } from './vallejo';

describe('Vallejo data', () => {
  it('resolves every code in every layout', () => {
    const missing = LAYOUTS.flatMap((layout) =>
      layout.sections.flatMap((s) => s.rows.flat().filter((code) => !PAINTS.has(code))),
    );
    expect(missing).toEqual([]);
  });

  it('has one layout per chart, combination table and Squidmar set', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual([
      'gameColor',
      'gameColorCombinations',
      'modelColor',
      'modelColorCombinations',
      'squidmarColorMegaSet',
      'squidmarColorEssentials',
    ]);
    for (const layout of LAYOUTS.filter((l) => l.columns)) {
      for (const row of layout.sections.flatMap((s) => s.rows)) expect(row).toHaveLength(layout.columns!.length);
    }
  });

  it('computes OKLab that round-trips to the hex and agrees with the stored OKLCh', () => {
    const stored = catalog as Record<string, { oklch: { l: number; c: number; h: number | null } }>;
    for (const paint of PAINTS.values()) {
      expect(oklabToHex(paint.lab)).toBe(paint.rgb.toLowerCase());
      const [L, C, h] = oklabToOklch(paint.lab);
      const { oklch } = stored[paint.code];
      expect(L).toBeCloseTo(oklch.l, 3);
      expect(C).toBeCloseTo(oklch.c, 3);
      if (oklch.h !== null) expect(h).toBeCloseTo(oklch.h, 1);
    }
  });
});
