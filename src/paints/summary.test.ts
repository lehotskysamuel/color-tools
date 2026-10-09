import { describe, expect, it } from 'vitest';
import { ALL_LAYOUTS, CUSTOM_SET_LAYOUTS } from './sets';
import { PAINT_TYPES, layoutPaints, summarizeSet } from './summary';

const layout = (id: string) => ALL_LAYOUTS.find((l) => l.id === id)!;
const counts = (id: string) => Object.fromEntries([...summarizeSet(layout(id)).types].filter(([, n]) => n > 0));

describe('set summary', () => {
  it('lists each paint of a layout once, in printed order', () => {
    expect(layoutPaints(layout('gameColor')).map((p) => p.id).slice(0, 4)).toEqual(['72.001', '72.101', '72.098', '72.034']);
    for (const l of ALL_LAYOUTS) {
      const paints = layoutPaints(l);
      expect(new Set(paints).size).toBe(paints.length);
    }
    const custom = CUSTOM_SET_LAYOUTS.map((l) => [l.id, layoutPaints(l).length]);
    expect(Object.fromEntries(custom)).toEqual({ squidmarV1: 31, squidmarV2: 41 });
  });

  it('orders the paint types by how common they are in the catalog', () => {
    expect(PAINT_TYPES).toEqual(['acrylic', 'ink', 'fluorescent', 'wash', 'metallic']);
  });

  it('counts the paints of each type, listing every type', () => {
    for (const l of ALL_LAYOUTS) {
      const { paints, types } = summarizeSet(l);
      expect([...types.keys()]).toEqual(PAINT_TYPES);
      expect([...types.values()].reduce((sum, n) => sum + n, 0)).toBe(paints.length);
    }
    expect(counts('gameColor')).toEqual({ acrylic: 80, ink: 12, fluorescent: 8, wash: 8 });
    expect(counts('modelColor')).toEqual({ acrylic: 192, ink: 2 });
    expect(counts('squidmarColorMegaSet')).toEqual({ acrylic: 48, ink: 12, fluorescent: 5, metallic: 7 });
  });

  it("counts a paint set's items without a color", () => {
    expect(summarizeSet(layout('inspiration')).notInCatalog).toBe(10);
    expect(summarizeSet(layout('gameColor')).notInCatalog).toBe(0);
  });

  // The same figures as the README's coverage table.
  it("measures each set's coverage of Pointer's gamut", () => {
    const coverage = (id: string) => summarizeSet(layout(id)).pointerCoverage;
    expect(coverage('gameColor')).toBeCloseTo(0.522, 2);
    expect(coverage('modelColor')).toBeCloseTo(0.341, 2);
    expect(coverage('squidmarColorMegaSet')).toBeCloseTo(0.497, 2);
    expect(coverage('kimeraKolorsBaseSet')).toBeCloseTo(0.38, 2);
  });
});
