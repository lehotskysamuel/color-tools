import { describe, expect, it } from 'vitest';
import {
  type KeyValueStorage,
  customSetLayouts,
  deleteSet,
  exportPath,
  exportSet,
  readSavedSets,
  saveSet,
  setKey,
} from './customSets';
import { BUILT_SETS, CUSTOM_SETS, SETS, SET_KEYS, dataSetColors } from './sets';
import { PAINTS } from './vallejo';

function memoryStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) };
}

describe('custom sets saved in the browser', () => {
  it('makes camelCase keys like the data, never repeating one', () => {
    expect(setKey('Squidmar v1', new Set())).toBe('squidmarV1');
    expect(setKey('  Skin tönes & more ', new Set())).toBe('skinTonesMore');
    expect(setKey('', new Set())).toBe('customSet');
    expect(setKey('72 paints', new Set())).toBe('set72Paints');
    expect(setKey('Squidmar v1', SET_KEYS)).toBe('squidmarV12');
  });

  it('saves, renames and deletes sets, keeping their order', () => {
    const storage = memoryStorage();
    const a = saveSet(null, { title: 'Greens', colors: ['72.029', '72.030'] }, storage)!;
    const b = saveSet(null, { title: 'Greens', colors: ['72.001'] }, storage)!;
    expect([a, b]).toEqual(['greens', 'greens2']);
    saveSet(a, { title: 'Dark greens', colors: ['72.030'] }, storage);
    expect([...readSavedSets(storage)]).toEqual([
      ['greens', { title: 'Dark greens', colors: ['72.030'] }],
      ['greens2', { title: 'Greens', colors: ['72.001'] }],
    ]);
    expect(deleteSet(a, storage)).toBe(true);
    expect([...readSavedSets(storage).keys()]).toEqual(['greens2']);
  });

  it('skips damaged storage instead of failing', () => {
    const storage = memoryStorage();
    storage.setItem('color-tools.custom-sets', '{"ok":{"title":"Ok","colors":["72.001"]},"bad":{"title":3}}');
    expect([...readSavedSets(storage).keys()]).toEqual(['ok']);
    storage.setItem('color-tools.custom-sets', 'not json');
    expect(readSavedSets(storage).size).toBe(0);
  });

  it('lists saved sets after the data, under ids that cannot clash with it', () => {
    const storage = memoryStorage();
    saveSet(null, { title: 'Mine', colors: ['72.001', 'gone'] }, storage);
    const layouts = customSetLayouts(storage);
    const mine = layouts.at(-1)!;
    expect(layouts.length).toBe(CUSTOM_SETS.size + BUILT_SETS.size + 1);
    expect(mine.id).toBe('local:mine');
    expect(mine.sections).toEqual([{ rows: [['72.001']] }]);
    expect(mine.note).toContain('1 of its paints is no longer in the data');
  });

  it('exports a file that reads back as the set', () => {
    const set = { title: 'My "set"', colors: ['72.001', 'The Red'] };
    expect(exportPath('mySet')).toBe('data/custom-sets/mySet.json');
    const text = exportSet(set);
    expect(text.startsWith('{\n  "title"')).toBe(true);
    expect(JSON.parse(text)).toEqual(set);
  });
});

describe('custom sets in data/custom-sets', () => {
  it('reads every file, keyed by its name, as one kind of custom set', () => {
    const files = import.meta.glob<object>('../../data/custom-sets/*', { eager: true, import: 'default' });
    const names = Object.keys(files).map((path) => path.replace(/^.*\//, ''));
    expect(names.filter((name) => !/^[a-z][A-Za-z0-9]*\.json$/.test(name))).toEqual([]);
    for (const set of Object.values(files)) {
      expect(Object.keys(set).sort()).toSatisfy((keys: string[]) => keys.join() === 'colors,title' || keys.join() === 'sets,title');
    }
    expect([...CUSTOM_SETS.keys(), ...BUILT_SETS.keys()].length).toBe(names.length);
    expect(CUSTOM_SETS.has('squidmarV1') && CUSTOM_SETS.has('squidmarV2')).toBe(true);
    expect(SET_KEYS.has('squidmarV1') && SET_KEYS.has('bsl')).toBe(true);
  });

  it("opens a custom set of sets as its sets' colors, once each", () => {
    const colors = dataSetColors('squidmarV1')!;
    expect(colors.length).toBe(31);
    expect(new Set(colors).size).toBe(colors.length);
    expect(dataSetColors('bsl')).toBeUndefined();
  });


  it('lists catalog paints, once each, and is no paint set or custom set of sets', () => {
    for (const set of BUILT_SETS.values()) {
      expect(set.colors.filter((id) => !PAINTS.has(id))).toEqual([]);
      expect(new Set(set.colors).size).toBe(set.colors.length);
      expect(SETS.has(set.id) || CUSTOM_SETS.has(set.id)).toBe(false);
    }
  });
});
