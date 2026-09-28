/**
 * Pointer's gamut: the gamut of real surface colors (M. R. Pointer, "The gamut of real surface colours",
 * Color Research & Application 5, 1980). Pointer measured 4089 samples of paints, inks, plastics and
 * textiles and published, for each CIELAB lightness and hue, the highest chroma any of them reached.
 *
 * The table is in CIE LCh(ab) under illuminant C; `CIELAB_C` places it in OKLab.
 */
import { CIELAB_C } from './cielab.ts';
import type { Vec3 } from './oklab.ts';

/** CIELAB lightness of each table row. */
export const POINTER_LIGHTNESS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90] as const;
/** CIELAB hue step of the table's columns, in degrees: 0, 10, … 350. */
export const POINTER_HUE_STEP = 10;

/**
 * Maximum C*ab per row of POINTER_LIGHTNESS, one column per hue 0°, 10°, … 350°.
 * Pointer (1980), as published in colour-science (`colour.models.DATA_POINTER_GAMUT_VOLUME`).
 */
// prettier-ignore
const CHROMA: readonly (readonly number[])[] = [
  [10, 15, 14, 35, 27, 10, 4, 5, 6, 4, 9, 9, 4, 5, 7, 7, 8, 13, 10, 7, 5, 0, 2, 10, 8, 9, 12, 14, 10, 20, 30, 62, 60, 20, 26, 15],
  [30, 30, 34, 48, 40, 21, 15, 15, 15, 12, 16, 18, 14, 18, 20, 21, 24, 25, 25, 19, 19, 12, 12, 20, 16, 21, 24, 31, 29, 40, 55, 76, 71, 50, 49, 37],
  [43, 45, 49, 59, 53, 34, 26, 25, 24, 20, 23, 27, 23, 30, 32, 34, 36, 36, 38, 30, 29, 17, 20, 29, 26, 32, 34, 42, 45, 60, 72, 85, 79, 72, 63, 52],
  [56, 56, 61, 68, 66, 45, 37, 36, 32, 28, 30, 35, 32, 40, 42, 45, 48, 47, 48, 40, 37, 26, 28, 36, 34, 40, 41, 50, 55, 69, 81, 88, 84, 86, 73, 65],
  [68, 64, 69, 75, 79, 60, 48, 46, 40, 36, 37, 44, 41, 48, 52, 57, 58, 57, 57, 48, 42, 34, 35, 42, 41, 49, 46, 55, 60, 71, 79, 85, 85, 89, 82, 73],
  [77, 70, 74, 82, 90, 75, 59, 56, 48, 44, 45, 52, 49, 56, 60, 68, 68, 65, 64, 55, 45, 43, 40, 46, 47, 54, 51, 60, 61, 69, 72, 80, 86, 89, 87, 79],
  [79, 73, 76, 84, 94, 90, 70, 67, 55, 53, 51, 59, 57, 64, 69, 75, 76, 70, 69, 59, 46, 49, 45, 49, 49, 55, 55, 60, 60, 65, 64, 71, 82, 86, 87, 82],
  [77, 73, 76, 83, 93, 100, 82, 76, 64, 60, 58, 66, 64, 70, 76, 81, 82, 75, 71, 62, 46, 51, 48, 51, 50, 55, 56, 57, 57, 58, 57, 62, 74, 80, 83, 84],
  [72, 71, 74, 80, 88, 102, 93, 85, 72, 68, 65, 74, 71, 77, 82, 84, 85, 76, 72, 62, 45, 54, 51, 52, 50, 52, 51, 50, 53, 50, 50, 55, 66, 72, 78, 79],
  [65, 65, 68, 75, 82, 99, 103, 94, 82, 75, 72, 82, 78, 82, 87, 84, 83, 75, 69, 60, 43, 50, 49, 50, 47, 48, 46, 45, 46, 43, 42, 47, 57, 63, 71, 73],
  [57, 57, 61, 67, 72, 88, 106, 102, 94, 83, 80, 87, 84, 85, 89, 83, 78, 71, 64, 55, 39, 46, 45, 45, 42, 43, 40, 39, 40, 36, 35, 41, 48, 54, 62, 63],
  [50, 48, 51, 56, 60, 75, 98, 108, 105, 90, 86, 92, 90, 88, 90, 80, 69, 65, 60, 49, 35, 40, 38, 39, 36, 36, 33, 33, 34, 29, 30, 34, 40, 45, 51, 53],
  [40, 39, 40, 45, 47, 59, 85, 103, 115, 98, 94, 95, 94, 89, 83, 72, 59, 57, 51, 41, 30, 32, 32, 32, 29, 29, 27, 26, 25, 24, 24, 27, 31, 36, 40, 40],
  [30, 30, 30, 33, 35, 45, 66, 82, 115, 106, 100, 100, 95, 84, 71, 58, 49, 45, 41, 32, 22, 24, 23, 24, 21, 21, 20, 20, 18, 18, 17, 20, 24, 27, 28, 30],
  [19, 18, 19, 21, 22, 30, 45, 58, 83, 111, 106, 96, 83, 64, 54, 44, 34, 30, 29, 23, 14, 14, 15, 15, 12, 13, 13, 13, 11, 12, 12, 14, 16, 18, 18, 17],
  [8, 7, 9, 10, 10, 15, 23, 34, 48, 90, 108, 84, 50, 35, 30, 20, 15, 15, 16, 13, 7, 4, 6, 7, 4, 4, 6, 6, 4, 5, 5, 6, 8, 9, 4, 6],
];

/**
 * The table stops at L* 15 and 90. Every surface color converges on black and white, so the solid is
 * closed with a straight taper to C* = 0 at L* 0 and 100. That part is an extrapolation, not data.
 */
const ROWS_L = [0, ...POINTER_LIGHTNESS, 100];
const ZERO_ROW = CHROMA[0].map(() => 0);
const ROWS_C = [ZERO_ROW, ...CHROMA, ZERO_ROW];

/**
 * Largest C*ab of Pointer's gamut at a CIELAB lightness and hue: linear in L* between table rows and
 * linear in hue between table columns.
 */
export function pointerMaxChroma(Lstar: number, hDeg: number): number {
  if (!(Lstar > 0 && Lstar < 100)) return 0;
  let i = 0;
  while (ROWS_L[i + 1] < Lstar) i++;
  const u = (Lstar - ROWS_L[i]) / (ROWS_L[i + 1] - ROWS_L[i]);
  const h = ((hDeg % 360) + 360) % 360;
  const j = Math.floor(h / POINTER_HUE_STEP) % ZERO_ROW.length;
  const k = (j + 1) % ZERO_ROW.length;
  const v = (h - j * POINTER_HUE_STEP) / POINTER_HUE_STEP;
  const lo = ROWS_C[i][j] * (1 - v) + ROWS_C[i][k] * v;
  const hi = ROWS_C[i + 1][j] * (1 - v) + ROWS_C[i + 1][k] * v;
  return lo * (1 - u) + hi * u;
}

/** The point of Pointer's boundary at a CIELAB lightness and hue, in OKLab. */
export function pointerBoundary(Lstar: number, hDeg: number): Vec3 {
  const C = pointerMaxChroma(Lstar, hDeg);
  const rad = (hDeg * Math.PI) / 180;
  return CIELAB_C.toOklab([Lstar, C * Math.cos(rad), C * Math.sin(rad)]);
}

const scratch: Vec3 = [0, 0, 0];

export function isOklabInPointer(L: number, a: number, b: number): boolean {
  const [Lstar, as, bs] = CIELAB_C.fromOklabInto(L, a, b, scratch);
  if (!(Lstar > 0 && Lstar < 100)) return false;
  let h = (Math.atan2(bs, as) * 180) / Math.PI;
  if (h < 0) h += 360;
  return Math.hypot(as, bs) <= pointerMaxChroma(Lstar, h);
}

/**
 * Largest OKLab chroma inside Pointer's gamut at an OKLab lightness and hue: the counterpart of
 * `maxChroma` for tracing the boundary in the slices' planes. Bisection is exact because every such ray
 * leaves the gamut once (a unit test checks that by brute force).
 */
export function maxPointerChroma(L: number, hDeg: number): number {
  if (L <= 0 || L >= 1) return 0;
  const rad = (hDeg * Math.PI) / 180;
  const ca = Math.cos(rad);
  const sb = Math.sin(rad);
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (isOklabInPointer(L, mid * ca, mid * sb)) lo = mid;
    else hi = mid;
  }
  return lo;
}
