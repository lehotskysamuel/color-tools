import { describe, expect, it } from 'vitest';
import catalog from '../../data/vallejo.json';
import { isOklabInGamut, oklabToHex, oklabToOklch } from '../color/oklab';
import { LAYOUTS, PAINTS } from './vallejo';

describe('Vallejo data', () => {
  it('resolves every code in every layout', () => {
    const missing = LAYOUTS.flatMap((layout) =>
      layout.sections.flatMap((s) => s.rows.flat().filter((code) => !PAINTS.has(code))),
    );
    expect(missing).toEqual([]);
  });

  it('has one layout per chart, combination table and Squidmar set, plus all paints together', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual([
      'gameColor',
      'gameColorCombinations',
      'modelColor',
      'modelColorCombinations',
      'squidmarColorMegaSet',
      'squidmarColorEssentials',
      'allPaints',
    ]);
    for (const layout of LAYOUTS.filter((l) => l.columns)) {
      for (const row of layout.sections.flatMap((s) => s.rows)) expect(row).toHaveLength(layout.columns!.length);
    }
  });

  it('shows every paint in the catalog exactly once in the combined layout', () => {
    const all = LAYOUTS.find((l) => l.id === 'allPaints')!;
    const codes = all.sections.flatMap((s) => s.rows.flat());
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(codes)).toEqual(new Set(PAINTS.keys()));
  });

  it('has print CMYK and CIELAB for the charts, and only a hex for Squidmar Color', () => {
    const stored = catalog as Record<string, { cmyk: unknown; cielab: unknown }>;
    for (const paint of PAINTS.values()) {
      const chart = paint.range !== 'Squidmar Color';
      expect(stored[paint.code].cmyk !== null).toBe(chart);
      expect(stored[paint.code].cielab !== null).toBe(chart);
      expect(paint.source).toBe(chart ? 'cielab' : 'rgb');
    }
  });

  it('computes OKLab from the best source, in agreement with the stored OKLCh', () => {
    const stored = catalog as Record<string, { oklch: { l: number; c: number; h: number | null } }>;
    for (const paint of PAINTS.values()) {
      if (paint.source === 'rgb') expect(oklabToHex(paint.lab)).toBe(paint.rgb.toLowerCase());
      const [L, C, h] = oklabToOklch(paint.lab);
      const { oklch } = stored[paint.code];
      expect(L).toBeCloseTo(oklch.l, 3);
      expect(C).toBeCloseTo(oklch.c, 3);
      if (oklch.h !== null) expect(h).toBeCloseTo(oklch.h, 1);
    }
  });

  it('draws each paint in its own color, or the nearest screen color when it lies outside sRGB', () => {
    let outside = 0;
    for (const paint of PAINTS.values()) {
      if (paint.source === 'rgb') expect(paint.display).toBe(paint.rgb);
      else if (isOklabInGamut(paint.lab)) expect(paint.display).toBe(oklabToHex(paint.lab));
      else outside++;
    }
    // The chart prints ten paints outside sRGB: mostly teals, turquoises and cyan blues (Off-White only just).
    expect(outside).toBe(10);
  });
});
