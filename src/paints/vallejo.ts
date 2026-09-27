import catalog from '../../data/vallejo.json';
import layoutData from '../../data/vallejo-layouts.json';
import { type Vec3, hexToLinear, linearSrgbToOklab } from '../color/oklab';

export interface Paint {
  code: string;
  name: string;
  range: string;
  /** acrylic, ink, wash, fluorescent or metallic (Squidmar Color only) */
  type: string;
  /**
   * "#RRGGBB": the official chart's print color converted to sRGB. Squidmar Color has no chart; its colors are
   * sampled from the announcement images.
   */
  rgb: string;
  /** Computed from `rgb`, so it matches the hex exactly rather than the rounded `oklch` in the JSON. */
  lab: Vec3;
}

export interface PaintSection {
  title?: string;
  rows: string[][];
}

/** The order the colors are printed in. See the `data/vallejo-layouts.json` section of the README. */
export interface PaintLayout {
  id: string;
  title: string;
  source: string;
  /** Present on combination layouts, where each row is one [highlight, base, shadow] triplet. */
  columns?: string[];
  sections: PaintSection[];
}

interface RawPaint {
  code: string;
  name: string;
  range: string;
  type: string;
  rgb: string;
}

export const PAINTS: ReadonlyMap<string, Paint> = new Map(
  Object.values(catalog as Record<string, RawPaint>).map(({ code, name, range, type, rgb }) => [
    code,
    { code, name, range, type, rgb, lab: linearSrgbToOklab(hexToLinear(rgb)) },
  ]),
);

const PRINTED: readonly PaintLayout[] = Object.entries(layoutData as Record<string, Omit<PaintLayout, 'id'>>).map(
  ([id, layout]) => ({ id, ...layout }),
);

/**
 * Every printed layout that adds paints, one after the other: every paint in the catalog, once. Combination
 * tables and sets that only repeat paints (Squidmar Essentials) are left out. A layout's untitled first section
 * gets the layout's title as its heading.
 */
function allPaints(): PaintLayout {
  const seen = new Set<string>();
  const parts = PRINTED.filter((layout) => {
    const codes = layout.sections.flatMap((s) => s.rows.flat());
    if (layout.columns || codes.every((code) => seen.has(code))) return false;
    for (const code of codes) seen.add(code);
    return true;
  });
  return {
    id: 'allPaints',
    title: 'All paints',
    source: parts.map((l) => l.source).join(', '),
    sections: parts.flatMap((l) => l.sections.map((s, i) => (i === 0 && !s.title ? { ...s, title: l.title } : s))),
  };
}

export const LAYOUTS: readonly PaintLayout[] = [...PRINTED, allPaints()];

/** "72.001 Dead White", plus the type for anything that is not a plain acrylic. */
export function paintLabel(paint: Paint): string {
  return `${paint.code} ${paint.name}${paint.type === 'acrylic' ? '' : ` · ${paint.type}`}`;
}
