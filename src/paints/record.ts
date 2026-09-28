/**
 * Which field of a paint record gives its color, shared by the page and the scripts:
 *
 *   1. `cielab` (D50) when the record has one: measured, or converted from the chart's print CMYK through the
 *      chart's own ICC profile. It is not limited to sRGB.
 *   2. `rgb` otherwise: an sRGB hex, which cannot hold colors outside sRGB.
 *
 * `cmyk` is not read here. It only means something together with the chart's ICC profile, so the extractor
 * turns it into `cielab`.
 */
import { CIELAB_D50 } from '../color/cielab.ts';
import { type Vec3, hexToLinear, linearSrgbToOklab } from '../color/oklab.ts';

export interface ColorRecord {
  rgb: string;
  cielab?: { l: number; a: number; b: number } | null;
}

export type ColorSource = 'cielab' | 'rgb';

export function colorSource(record: ColorRecord): ColorSource {
  return record.cielab ? 'cielab' : 'rgb';
}

/** The record's color in OKLab, from its best source. */
export function recordOklab(record: ColorRecord): Vec3 {
  const { cielab } = record;
  return cielab ? CIELAB_D50.toOklab([cielab.l, cielab.a, cielab.b]) : linearSrgbToOklab(hexToLinear(record.rgb));
}
