import { describe, expect, it } from 'vitest';
import catalog from '../../data/vallejo.json';
import { isOklabInGamut, oklabToHex, oklabToOklch } from '../color/oklab';
import { LAYOUTS, PAINTS, paintLabel } from './vallejo';

describe('Vallejo data', () => {
  it('resolves every paint in every layout', () => {
    const missing = LAYOUTS.flatMap((layout) =>
      layout.sections.flatMap((s) => s.rows.flat().filter((id) => !PAINTS.has(id))),
    );
    expect(missing).toEqual([]);
  });

  it('has one layout per chart, Squidmar set and Kimera set', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual([
      'gameColor',
      'modelColor',
      'squidmarColorMegaSet',
      'squidmarColorEssentials',
      'kimeraKolorsBaseSet',
    ]);
  });

  it('shows every paint in the catalog in some layout', () => {
    const ids = LAYOUTS.flatMap((layout) => layout.sections.flatMap((s) => s.rows.flat()));
    expect(new Set(ids)).toEqual(new Set(PAINTS.keys()));
  });

  it('has print CMYK and CIELAB for the charts, only a hex for Squidmar Color, and measured CIELAB for Kimera', () => {
    const stored = catalog as Record<string, { cmyk: unknown; cielab: unknown }>;
    for (const paint of PAINTS.values()) {
      const chart = paint.range === 'Game Color' || paint.range === 'Model Color';
      const measured = paint.range === 'Kimera Kolors';
      expect(stored[paint.id].cmyk !== null).toBe(chart);
      expect(stored[paint.id].cielab !== null).toBe(chart || measured);
      expect(paint.source).toBe(chart || measured ? 'cielab' : 'rgb');
    }
  });

  it('keys Vallejo paints by code and Kimera Kolors, which have no codes, by name, each with its pigment', () => {
    const kimera = [...PAINTS.values()].filter((p) => p.range === 'Kimera Kolors');
    expect(kimera).toHaveLength(13);
    for (const paint of PAINTS.values()) {
      if (paint.range === 'Kimera Kolors') {
        expect([paint.id, paint.code]).toEqual([paint.name, null]);
        expect(paint.pigment).toMatch(/^P(W|Bk|V|G|B|R|Y|O)\d+(:\d)?$/);
      } else {
        expect(paint.id).toBe(paint.code);
        expect(paint.pigment).toBeUndefined();
      }
    }
    expect(paintLabel(PAINTS.get('The Red')!)).toBe('The Red · PR170');
    expect(paintLabel(PAINTS.get('72.001')!)).toBe('72.001 Dead White');
  });

  it("has the manufacturer's web color for every paint, which for Squidmar Color and Kimera is its rgb", () => {
    const stored = catalog as Record<string, { rgb: string; webhex: string }>;
    for (const paint of PAINTS.values()) {
      const { rgb, webhex } = stored[paint.id];
      expect(webhex).toMatch(/^#[0-9A-F]{6}$/);
      if (paint.range === 'Squidmar Color' || paint.range === 'Kimera Kolors') expect(webhex).toBe(rgb);
    }
  });

  it('computes OKLab from the best source, in agreement with the stored OKLCh', () => {
    const stored = catalog as Record<string, { oklch: { l: number; c: number; h: number | null } }>;
    for (const paint of PAINTS.values()) {
      if (paint.source === 'rgb') expect(oklabToHex(paint.lab)).toBe(paint.rgb.toLowerCase());
      const [L, C, h] = oklabToOklch(paint.lab);
      const { oklch } = stored[paint.id];
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
    // The charts print ten paints outside sRGB: mostly teals, turquoises and cyan blues (Off-White only just).
    // Three Kimera Kolors are measured outside it: Warm Yellow, Cold Yellow and Phthalo Green.
    expect(outside).toBe(13);
  });
});
