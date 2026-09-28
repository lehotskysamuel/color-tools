import { describe, expect, it } from 'vitest';
import { PAINT_TYPES, layoutPaints, summarizeSet } from './sets';
import { LAYOUTS } from './vallejo';

const layout = (id: string) => LAYOUTS.find((l) => l.id === id)!;
const counts = (id: string) => Object.fromEntries([...summarizeSet(layout(id)).types].filter(([, n]) => n > 0));

describe('paint sets', () => {
  it('lists each paint of a layout once, in printed order', () => {
    const combinations = layoutPaints(layout('gameColorCombinations'));
    expect(new Set(combinations).size).toBe(combinations.length);
    expect(combinations.map((p) => p.code).slice(0, 4)).toEqual(['72.001', '72.101', '72.098', '72.034']);
    expect(LAYOUTS.map((l) => layoutPaints(l).length)).toEqual([108, 72, 194, 157, 72, 30, 374]);
  });

  it('orders the paint types by how common they are in the catalog', () => {
    expect(PAINT_TYPES).toEqual(['acrylic', 'ink', 'fluorescent', 'wash', 'metallic']);
  });

  it('counts the paints of each type, listing every type', () => {
    for (const l of LAYOUTS) {
      const { paints, types } = summarizeSet(l);
      expect([...types.keys()]).toEqual(PAINT_TYPES);
      expect([...types.values()].reduce((sum, n) => sum + n, 0)).toBe(paints.length);
    }
    expect(counts('gameColor')).toEqual({ acrylic: 80, ink: 12, fluorescent: 8, wash: 8 });
    expect(counts('modelColor')).toEqual({ acrylic: 192, ink: 2 });
    expect(counts('squidmarColorMegaSet')).toEqual({ acrylic: 48, ink: 12, fluorescent: 5, metallic: 7 });
  });

  // The same figures as the README's coverage table.
  it("measures each set's coverage of Pointer's gamut", () => {
    const coverage = (id: string) => summarizeSet(layout(id)).pointerCoverage;
    expect(coverage('gameColor')).toBeCloseTo(0.455, 2);
    expect(coverage('modelColor')).toBeCloseTo(0.302, 2);
    expect(coverage('squidmarColorMegaSet')).toBeCloseTo(0.497, 2);
    expect(coverage('allPaints')).toBeCloseTo(0.569, 2);
  });
});
