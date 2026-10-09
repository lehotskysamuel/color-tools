/**
 * Custom sets saved in this browser by the Set Builder, and every custom set as layouts for the swatch pane.
 *
 * Saved sets live in localStorage as one JSON object of `{ title, colors }`, keyed like the files of
 * `data/custom-sets/`, so an exported set can be saved there as it is.
 */
import { type BuiltSet, CUSTOM_SET_LAYOUTS, SET_KEYS, SET_LAYOUTS, builtSetLayout } from './sets';
import { LAYOUTS, type PaintLayout } from './vallejo';

const STORAGE_KEY = 'color-tools.custom-sets';
/** Fired on window when this page changes the saved sets; other tabs get a `storage` event. */
const CHANGE_EVENT = 'color-tools:custom-sets';
/** Layout ids of saved sets, so they never clash with a data set of the same key. */
const LOCAL_PREFIX = 'local:';

export type SavedSet = Omit<BuiltSet, 'id'>;

/** The parts of `Storage` used here, so tests can pass a stand-in. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** The saved sets in the order they were first saved. Malformed entries are skipped. */
export function readSavedSets(storage = defaultStorage()): Map<string, SavedSet> {
  let raw: unknown;
  try {
    raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return new Map();
  }
  if (typeof raw !== 'object' || raw === null) return new Map();
  return new Map(
    Object.entries(raw).flatMap(([key, value]) => {
      const { title, colors } = (value ?? {}) as Partial<SavedSet>;
      const valid = typeof title === 'string' && Array.isArray(colors) && colors.every((c) => typeof c === 'string');
      return valid ? [[key, { title, colors: [...colors] }] as const] : [];
    }),
  );
}

function writeSavedSets(sets: Map<string, SavedSet>, storage: KeyValueStorage | null): boolean {
  try {
    storage!.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(sets)));
  } catch {
    // No storage (private mode, blocked site data) or it is full.
    return false;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

/**
 * Saves a set under `key`, or under a new key made from its title when `key` is null. Returns the key, or null
 * when the browser would not store it.
 */
export function saveSet(key: string | null, set: SavedSet, storage = defaultStorage()): string | null {
  const sets = readSavedSets(storage);
  const id = key ?? setKey(set.title, new Set([...SET_KEYS, ...sets.keys()]));
  sets.set(id, { title: set.title, colors: [...set.colors] });
  return writeSavedSets(sets, storage) ? id : null;
}

export function deleteSet(key: string, storage = defaultStorage()): boolean {
  const sets = readSavedSets(storage);
  return sets.delete(key) && writeSavedSets(sets, storage);
}

/** Calls `fn` when the saved sets change, in this tab or another. */
export function onSavedSetsChange(fn: () => void): void {
  window.addEventListener(CHANGE_EVENT, fn);
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) fn();
  });
}

/** A camelCase key from the title, like the data's keys ("Squidmar v1" → "squidmarV1"), not one of `taken`. */
export function setKey(title: string, taken: ReadonlySet<string>): string {
  const words = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1))).join('');
  if (!/^[a-z]/.test(base)) base = `set${base[0]?.toUpperCase() ?? ''}${base.slice(1)}`;
  if (base === 'set') base = 'customSet';
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  return key;
}

/** Where an exported set goes in the repository. */
export function exportPath(key: string): string {
  return `data/custom-sets/${key}.json`;
}

/** The set as the contents of its file in `data/custom-sets/`, formatted like the files there. */
export function exportSet(set: SavedSet): string {
  const colors = set.colors.map((c) => JSON.stringify(c)).join(', ');
  return `{\n  "title": ${JSON.stringify(set.title)},\n  "colors": [${colors}]\n}\n`;
}

export function savedSetLayoutId(key: string): string {
  return LOCAL_PREFIX + key;
}

/** The custom sets of the data, then those saved in this browser. */
export function customSetLayouts(storage = defaultStorage()): PaintLayout[] {
  const saved = [...readSavedSets(storage)].map(([key, set]) => ({
    ...builtSetLayout(savedSetLayoutId(key), set, 'Your custom set, saved in this browser'),
    title: `${set.title} (saved here)`,
  }));
  return [...CUSTOM_SET_LAYOUTS, ...saved];
}

/**
 * The groups of every layout select (the atlas's paint pane, the set comparator, the difference matrix and the
 * Set Builder). Custom sets include those saved in this browser, so the groups are read each time.
 */
export function layoutGroups(storage = defaultStorage()): [label: string, layouts: readonly PaintLayout[]][] {
  return [
    ['Ranges', LAYOUTS],
    ['Paint sets', SET_LAYOUTS],
    ['Custom sets', customSetLayouts(storage)],
  ];
}

/** Every layout of the selects, in their order. */
export function allLayouts(): PaintLayout[] {
  return layoutGroups().flatMap(([, layouts]) => layouts);
}

/** Adds one option group per layout group to a select; returns the layouts it added, in order. */
export function appendLayoutGroups(select: HTMLSelectElement): PaintLayout[] {
  const groups = layoutGroups();
  for (const [label, layouts] of groups) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const layout of layouts) group.append(new Option(layout.title, layout.id));
    select.append(group);
  }
  return groups.flatMap(([, layouts]) => layouts);
}
