/** What the set comparator shows about a layout's paints, apart from the render. */
import { colorSetCoverage } from '../color/coverage';
import { type Paint, type PaintLayout, PAINTS } from './vallejo';

/** Each paint of a layout once, in printed order. A custom set can hold a paint in several of its sets. */
export function layoutPaints(layout: PaintLayout): Paint[] {
  const ids = new Set(layout.sections.flatMap((s) => s.rows.flat()));
  return [...ids].map((id) => PAINTS.get(id)!);
}

/** Every paint type in the catalog, the most common first. */
export const PAINT_TYPES: readonly string[] = (() => {
  const counts = new Map<string, number>();
  for (const { type } of PAINTS.values()) counts.set(type, (counts.get(type) ?? 0) + 1);
  return [...counts].sort((p, q) => q[1] - p[1]).map(([type]) => type);
})();

export interface SetSummary {
  paints: Paint[];
  /** How many paints of each type, for every type in PAINT_TYPES and in its order, zero included. */
  types: Map<string, number>;
  /** Items of a paint set that the catalog has no color for, such as metallics and varnishes. */
  notInCatalog: number;
  /** Share of Pointer's gamut's volume that the paints' hull covers, or null when the hull has no volume. */
  pointerCoverage: number | null;
}

export function summarizeSet(layout: PaintLayout): SetSummary {
  const paints = layoutPaints(layout);
  const types = new Map(PAINT_TYPES.map((type) => [type, 0]));
  for (const { type } of paints) types.set(type, types.get(type)! + 1);
  return {
    paints,
    types,
    notInCatalog: layout.notInCatalog?.length ?? 0,
    pointerCoverage: colorSetCoverage(paints.map((p) => p.lab), 'pointer'),
  };
}
