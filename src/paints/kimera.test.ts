import { describe, expect, it } from 'vitest';
import catalog from '../../data/kimera.json';
import { oklabToOklch } from '../color/oklab';
import { type ColorRecord, recordOklab } from './record';

interface KimeraColor extends ColorRecord {
  name: string;
  pigment: string;
  webhex: string;
  cielabSource: string | null;
  oklch: { l: number; c: number; h: number | null };
}

const colors = Object.entries(catalog as Record<string, KimeraColor>);

describe('Kimera data', () => {
  it('has the 13 colors of the base set, keyed by name, each with one pigment and a web color', () => {
    expect(colors).toHaveLength(13);
    for (const [key, color] of colors) {
      expect(color.name).toBe(key);
      expect(color.pigment).toMatch(/^P(W|Bk|V|G|B|R|Y|O)\d+(:\d)?$/);
      expect(color.webhex).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.rgb).toBe(color.webhex);
    }
  });

  it('names the stand-in behind every cielab, and has none for PR170, PO34 and PY151', () => {
    for (const [, color] of colors) expect(color.cielabSource === null).toBe(color.cielab === null);
    const without = colors.filter(([, color]) => !color.cielab).map(([, color]) => color.pigment);
    expect(without.sort()).toEqual(['PO34', 'PR170', 'PY151']);
  });

  it('stores OKLCh computed from the best source', () => {
    for (const [, color] of colors) {
      const [L, C, h] = oklabToOklch(recordOklab(color));
      expect(L).toBeCloseTo(color.oklch.l, 3);
      expect(C).toBeCloseTo(color.oklch.c, 3);
      if (color.oklch.h !== null) expect(h).toBeCloseTo(color.oklch.h, 1);
    }
  });
});
