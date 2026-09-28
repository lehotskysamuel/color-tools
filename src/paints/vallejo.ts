import catalog from '../../data/vallejo.json';
import layoutData from '../../data/vallejo-layouts.json';
import { type Vec3, oklabToDisplayHex } from '../color/oklab';
import { type ColorRecord, type ColorSource, colorSource, recordOklab } from './record';

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
  /** Which field `lab` comes from: `cielab` when the data has one, else `rgb` (see ./record.ts). */
  source: ColorSource;
  /**
   * OKLab, from the best source, computed here so it is exact rather than the rounded `oklch` in the JSON.
   * From `cielab` it can lie outside sRGB.
   */
  lab: Vec3;
  /** "#rrggbb" to draw the paint with: `rgb` when that is the source, else the nearest screen color of `lab`. */
  display: string;
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

interface RawPaint extends ColorRecord {
  code: string;
  name: string;
  range: string;
  type: string;
}

export const PAINTS: ReadonlyMap<string, Paint> = new Map(
  Object.values(catalog as Record<string, RawPaint>).map((raw) => {
    const { code, name, range, type, rgb } = raw;
    const source = colorSource(raw);
    const lab = recordOklab(raw);
    return [code, { code, name, range, type, rgb, source, lab, display: source === 'rgb' ? rgb : oklabToDisplayHex(lab) }];
  }),
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
