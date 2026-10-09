import setData from '../../data/vallejo-sets.json';
import type { OffCatalogItem, PaintLayout } from './vallejo';

/** A boxed set of paints as Vallejo sells it. See the `data/vallejo-sets.json` section of the README. */
export interface PaintSet {
  id: string;
  title: string;
  /** Vallejo's product code for the set. */
  code: string;
  /** Codes of the set's paints that the catalog has a color for, in code order. */
  colors: string[];
  /** The rest of the set. */
  notInCatalog: OffCatalogItem[];
}

/** Several sets as one. It lists sets, not colors: its colors are always read from those sets. */
export interface CustomSet {
  id: string;
  title: string;
  /** Ids of paint sets, never of other custom sets. */
  sets: string[];
}

type RawSet = Omit<PaintSet, 'id'> | Omit<CustomSet, 'id'>;

const entries = Object.entries(setData as Record<string, RawSet>);

export const SETS: ReadonlyMap<string, PaintSet> = new Map(
  entries.flatMap(([id, set]) => ('colors' in set ? [[id, { id, ...set }] as const] : [])),
);

export const CUSTOM_SETS: ReadonlyMap<string, CustomSet> = new Map(
  entries.flatMap(([id, set]) => ('sets' in set ? [[id, { id, ...set }] as const] : [])),
);

/** The sets a custom set is made of, with their colors. */
export function customSetParts(custom: CustomSet): PaintSet[] {
  return custom.sets.map((id) => SETS.get(id)!);
}

const setTitle = (set: PaintSet) => `${set.title} (${set.code})`;

/** One section per set. Items missing from several sets are listed once. */
function setLayout(id: string, title: string, parts: PaintSet[]): PaintLayout {
  const codes = parts.map((set) => set.code).join(', ').replace(/, (?=[^,]*$)/, ' and ');
  const notInCatalog = new Map(parts.flatMap((set) => set.notInCatalog.map((item) => [item.code, item] as const)));
  return {
    id,
    title,
    source: `Vallejo set${parts.length > 1 ? 's' : ''} ${codes}`,
    notInCatalog: [...notInCatalog.values()],
    sections: parts.map((set) => ({ title: setTitle(set), rows: [set.colors] })),
  };
}

export const SET_LAYOUTS: readonly PaintLayout[] = [...SETS.values()].map((set) =>
  setLayout(set.id, setTitle(set), [set]),
);

export const CUSTOM_SET_LAYOUTS: readonly PaintLayout[] = [...CUSTOM_SETS.values()].map((custom) =>
  setLayout(custom.id, custom.title, customSetParts(custom)),
);
