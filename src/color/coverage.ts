/**
 * How much of a gamut's volume another shape covers, measured in OKLab so that equal volumes are equal
 * perceptual extents. Volumes are sums over a regular grid of cells:
 *
 *   1. Split OKLab (L 0..1, a and b within ±AB_RANGE) into cubes 0.01 on a side.
 *   2. Keep the centers that lie inside the gamut. They stand for its volume; computed once per gamut.
 *   3. The coverage of a shape is the fraction of those centers that also lie inside the shape.
 *
 * Parts of the shape outside the gamut do not count, so the result is between 0 and 1.
 */
import { type Hull, convexHull, hullContains } from './hull.ts';
import { AB_RANGE, GAMUT_EPSILON, type Vec3, oklabToLinearSrgbInto } from './oklab.ts';
import { isOklabInPointer } from './pointer.ts';

/** The gamut drawn as the color space in view A. */
export type Gamut = 'srgb' | 'pointer';

/** Grid step in OKLab units. A four times finer grid moves the Vallejo figures by less than 0.05 points. */
const STEP = 0.01;

const rgb: Vec3 = [0, 0, 0];
const inSrgb = (L: number, a: number, b: number) => {
  oklabToLinearSrgbInto(L, a, b, rgb);
  const lo = -GAMUT_EPSILON;
  const hi = 1 + GAMUT_EPSILON;
  return rgb[0] >= lo && rgb[0] <= hi && rgb[1] >= lo && rgb[1] <= hi && rgb[2] >= lo && rgb[2] <= hi;
};

const INSIDE: Record<Gamut, (L: number, a: number, b: number) => boolean> = {
  srgb: inSrgb,
  pointer: isOklabInPointer,
};

const samples = new Map<Gamut, Float32Array>();

/** Cell centers inside the gamut as (L, a, b) triples. Both gamuts fit in L 0..1, a and b within ±AB_RANGE. */
export function gamutSamples(gamut: Gamut): Float32Array {
  let points = samples.get(gamut);
  if (points) return points;
  const inside = INSIDE[gamut];
  const out: number[] = [];
  const nL = Math.round(1 / STEP);
  const nAB = Math.round((2 * AB_RANGE) / STEP);
  for (let i = 0; i < nL; i++) {
    const L = (i + 0.5) * STEP;
    for (let j = 0; j < nAB; j++) {
      const a = -AB_RANGE + (j + 0.5) * STEP;
      for (let k = 0; k < nAB; k++) {
        const b = -AB_RANGE + (k + 0.5) * STEP;
        if (inside(L, a, b)) out.push(L, a, b);
      }
    }
  }
  points = new Float32Array(out);
  samples.set(gamut, points);
  return points;
}

/** Fraction of the gamut's volume for which `test` holds. */
export function volumeShare(gamut: Gamut, test: (L: number, a: number, b: number) => boolean): number {
  const points = gamutSamples(gamut);
  let hits = 0;
  for (let i = 0; i < points.length; i += 3) if (test(points[i], points[i + 1], points[i + 2])) hits++;
  return hits / (points.length / 3);
}

/** Fraction of the gamut's volume inside the hull. */
export function hullCoverage(gamut: Gamut, hull: Hull): number {
  return volumeShare(gamut, (L, a, b) => hullContains(hull, L, a, b));
}

/**
 * Fraction of the gamut's volume inside the convex hull of a set of OKLab colors. Null when the colors
 * enclose no volume: fewer than 4, or all in one plane.
 */
export function colorSetCoverage(colors: readonly Vec3[], gamut: Gamut = 'pointer'): number | null {
  const hull = convexHull(colors);
  return hull ? hullCoverage(gamut, hull) : null;
}

let srgbShare: number | null = null;

/** Fraction of Pointer's gamut that sRGB can show. */
export function srgbShareOfPointer(): number {
  srgbShare ??= volumeShare('pointer', inSrgb);
  return srgbShare;
}
