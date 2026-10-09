import { describe, expect, it } from 'vitest';
import catalog from '../../data/kimera.json';
import { oklabToOklch } from '../color/oklab';
import { type ColorRecord, recordOklab } from './record';

interface KimeraColor extends ColorRecord {
  name: string;
  pigment: string;
  webhex: string;
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

  it('has a measured CIELAB for every color', () => {
    for (const [, color] of colors) expect(color.cielab).toEqual({ l: expect.any(Number), a: expect.any(Number), b: expect.any(Number) });
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
