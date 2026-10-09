import { describe, expect, it } from 'vitest';
import { CUSTOM_SETS, CUSTOM_SET_LAYOUTS, SETS, SET_LAYOUTS, customSetParts } from './sets';
import { LAYOUTS, PAINTS } from './vallejo';

describe('Vallejo paint sets', () => {
  it('has every set of the source table, with all of its items', () => {
    const sizes = Object.fromEntries(
      [...SETS.values()].map((set) => [
        [set.code, set.title].filter(Boolean).join(' '),
        set.colors.length + set.notInCatalog.length,
      ]),
    );
    expect(sizes).toEqual({
      '72.201 Squidmar Essential': 12,
      '72.202 Squidmar Dark Future': 12,
      '72.203 Squidmar Fantasy': 12,
      '72.207 Squidmar Special FX': 12,
      'Squidmar Color Mega Set': 72,
      'Squidmar Color Essentials': 30,
      '72.183 Vallejo BSL': 47,
      '72.215 Vallejo Starter Value': 10,
      '72.299 Vallejo Introduction': 16,
      '72.298 Vallejo Advanced': 16,
      '72.188 Vallejo Specialist': 16,
      '70.260 Vallejo Wargames Basics': 8,
      '70.257 Vallejo Wargame Special': 16,
      '72.182 Vallejo Inspiration': 48,
    });
  });

  it('makes the Squidmar Color Mega Set the whole range, and the Essentials part of it', () => {
    const range = LAYOUTS.find((l) => l.id === 'squidmarColor')!.sections.flatMap((s) => s.rows.flat());
    expect(SETS.get('squidmarColorMegaSet')!.colors).toEqual([...range].sort());
    expect(SETS.get('squidmarColorEssentials')!.colors.filter((code) => !range.includes(code))).toEqual([]);
  });

  it('lists a paint under colors exactly when the catalog has it, once, in code order', () => {
    for (const set of SETS.values()) {
      expect(set.colors.filter((code) => !PAINTS.has(code))).toEqual([]);
      expect(set.notInCatalog.filter((item) => PAINTS.has(item.code))).toEqual([]);
      const codes = [...set.colors, ...set.notInCatalog.map((item) => item.code)];
      expect(new Set(codes).size).toBe(codes.length);
      expect(set.colors).toEqual([...set.colors].sort());
    }
  });

  it('makes custom sets of paint sets only', () => {
    for (const custom of CUSTOM_SETS.values()) {
      expect(custom.sets.filter((id) => !SETS.has(id))).toEqual([]);
    }
    expect(customSetParts(CUSTOM_SETS.get('squidmarV1')!).map((s) => s.code)).toEqual(['72.201', '72.202', '72.203']);
    expect(customSetParts(CUSTOM_SETS.get('squidmarV2')!).map((s) => s.code)).toEqual([
      '72.201',
      '72.202',
      '72.203',
      '72.207',
    ]);
  });

  it("shows a custom set as its sets' own colors, one section each", () => {
    for (const layout of CUSTOM_SET_LAYOUTS) {
      const parts = customSetParts(CUSTOM_SETS.get(layout.id)!);
      expect(layout.sections.map((s) => s.rows.flat())).toEqual(parts.map((set) => set.colors));
      const missing = new Set(parts.flatMap((set) => set.notInCatalog.map((item) => item.code)));
      expect(layout.notInCatalog!.map((item) => item.code)).toEqual([...missing]);
    }
  });

  it('gives every layout its own id', () => {
    const ids = [...LAYOUTS, ...SET_LAYOUTS, ...CUSTOM_SET_LAYOUTS].map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
