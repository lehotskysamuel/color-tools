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

/** Something Vallejo sells that the catalog has no color for, such as a metallic or a varnish. */
export interface OffCatalogItem {
  code: string;
  name: string;
  /** metallic, Xpress Color, Special FX, medium, thinner or varnish: why the catalog has no color for it. */
  kind: string;
}

export interface PaintSection {
  title?: string;
  rows: string[][];
}

/** The order the colors are printed in. See the `data/vallejo-layouts.json` section of the README. */
export interface PaintLayout {
  id: string;
  title: string;
  /** Where the paints and their order come from. */
  source: string;
  /**
   * Present on paint sets (./sets.ts). A set has no printed order: each section is one set, in a single row of
   * codes in code order. Lists what the sets hold that the catalog has no color for.
   */
  notInCatalog?: OffCatalogItem[];
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

export const LAYOUTS: readonly PaintLayout[] = Object.entries(
  layoutData as Record<string, Omit<PaintLayout, 'id'>>,
).map(([id, layout]) => ({ id, ...layout }));

/** "72.001 Dead White", plus the type for anything that is not a plain acrylic. */
export function paintLabel(paint: Paint): string {
  return `${paint.code} ${paint.name}${paint.type === 'acrylic' ? '' : ` · ${paint.type}`}`;
}
