import setData from '../../data/vallejo-sets.json';
import { type OffCatalogItem, type PaintLayout, PAINTS } from './vallejo';

/** A boxed set of paints as Vallejo sells it. See the `data/vallejo-sets.json` section of the README. */
export interface PaintSet {
  id: string;
  title: string;
  /** Vallejo's product code for the set, or null when it has none yet (the Squidmar Color boxes). */
  code: string | null;
  /** Codes of the set's paints that the catalog has a color for, in code order. */
  colors: string[];
  /** The rest of the set. */
  notInCatalog: OffCatalogItem[];
}

/**
 * Several sets as one, from a file in `data/custom-sets/`. It lists sets, not colors: its colors are always read
 * from those sets.
 */
export interface CustomSet {
  id: string;
  title: string;
  /** Ids of paint sets, never of other custom sets. */
  sets: string[];
}

/** Paints picked one by one in the Set Builder, saved in the browser or as a file in `data/custom-sets/`. */
export interface BuiltSet {
  id: string;
  title: string;
  /** Keys of paints in the catalog, in the order they were picked. */
  colors: string[];
}

type RawCustomSet = Omit<CustomSet, 'id'> | Omit<BuiltSet, 'id'>;

export const SETS: ReadonlyMap<string, PaintSet> = new Map(
  Object.entries(setData as Record<string, Omit<PaintSet, 'id'>>).map(([id, set]) => [id, { id, ...set }]),
);

/** Every file of `data/custom-sets/`, keyed by its name without `.json`, in name order. */
const customFiles: [string, RawCustomSet][] = Object.entries(
  import.meta.glob<RawCustomSet>('../../data/custom-sets/*.json', { eager: true, import: 'default' }),
)
  .map(([path, set]): [string, RawCustomSet] => [path.replace(/^.*\/|\.json$/g, ''), set])
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

export const CUSTOM_SETS: ReadonlyMap<string, CustomSet> = new Map(
  customFiles.flatMap(([id, set]) => ('sets' in set ? [[id, { id, ...set }] as const] : [])),
);

/** Built sets that are part of the data, read only. Those saved in the browser are in ./customSets.ts. */
export const BUILT_SETS: ReadonlyMap<string, BuiltSet> = new Map(
  customFiles.flatMap(([id, set]) => ('colors' in set ? [[id, { id, ...set }] as const] : [])),
);

/** Every key of a set or a custom set in the data, which a new set's key must not repeat. */
export const SET_KEYS: ReadonlySet<string> = new Set([...SETS.keys(), ...customFiles.map(([id]) => id)]);

/** The colors of any custom set from the data, once each: a built set's own, or those of a custom set's sets. */
export function dataSetColors(id: string): string[] | undefined {
  const built = BUILT_SETS.get(id);
  if (built) return built.colors.filter((key) => PAINTS.has(key));
  const custom = CUSTOM_SETS.get(id);
  return custom && [...new Set(customSetParts(custom).flatMap((set) => set.colors))];
}

/** The sets a custom set is made of, with their colors. */
export function customSetParts(custom: CustomSet): PaintSet[] {
  return custom.sets.map((id) => SETS.get(id)!);
}

const setTitle = (set: PaintSet) => (set.code ? `${set.title} (${set.code})` : set.title);

/** One section per set. Items missing from several sets are listed once. */
function setLayout(id: string, title: string, parts: PaintSet[]): PaintLayout {
  const and = (names: string[]) => names.join(', ').replace(/, (?=[^,]*$)/, ' and ');
  const coded = parts.every((set) => set.code);
  const notInCatalog = new Map(parts.flatMap((set) => set.notInCatalog.map((item) => [item.code, item] as const)));
  return {
    id,
    title,
    source: coded
      ? `Vallejo set${parts.length > 1 ? 's' : ''} ${and(parts.map((set) => set.code!))}`
      : and(parts.map((set) => (set.code ? `Vallejo set ${set.code}` : `the ${set.title}`))),
    notInCatalog: [...notInCatalog.values()],
    sections: parts.map((set) => ({ title: setTitle(set), rows: [set.colors] })),
  };
}

/**
 * A built set as one section, in the order its paints were picked. Paints that are no longer in the catalog (a set
 * saved in the browser before the data changed) are left out and counted in the note.
 */
export function builtSetLayout(id: string, set: Omit<BuiltSet, 'id'>, where: string): PaintLayout {
  const colors = set.colors.filter((key) => PAINTS.has(key));
  const gone = set.colors.length - colors.length;
  return {
    id,
    title: set.title,
    source: set.title,
    notInCatalog: [],
    note:
      `${where}, in the order the paints were picked.` +
      (gone > 0 ? ` ${gone} of its paints ${gone > 1 ? 'are' : 'is'} no longer in the data.` : ''),
    sections: [{ rows: [colors] }],
  };
}

export const SET_LAYOUTS: readonly PaintLayout[] = [...SETS.values()].map((set) =>
  setLayout(set.id, setTitle(set), [set]),
);

export const CUSTOM_SET_LAYOUTS: readonly PaintLayout[] = [
  ...[...CUSTOM_SETS.values()].map((custom) => setLayout(custom.id, custom.title, customSetParts(custom))),
  ...[...BUILT_SETS.values()].map((set) => builtSetLayout(set.id, set, 'A custom set from the data')),
];
