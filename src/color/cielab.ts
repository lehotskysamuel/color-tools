/**
 * CIELAB relative to a given white, and OKLab (which is relative to D65). Points go CIELAB -> XYZ -> Bradford
 * adaptation to D65 -> linear sRGB (unbounded) -> OKLab, so a neutral stays neutral and the white maps to
 * OKLab L = 1. Two whites are used: illuminant C for Pointer's gamut, and D50 for color data, which is the
 * white of ICC profiles and of most measuring instruments.
 */
import { type Vec3, linearSrgbToOklab, oklabToLinearSrgbInto } from './oklab.ts';

type Mat3 = readonly [Vec3, Vec3, Vec3];

const apply = (m: Mat3, [x, y, z]: Vec3): Vec3 => [
  m[0][0] * x + m[0][1] * y + m[0][2] * z,
  m[1][0] * x + m[1][1] * y + m[1][2] * z,
  m[2][0] * x + m[2][1] * y + m[2][2] * z,
];

const multiply = (a: Mat3, b: Mat3): Mat3 =>
  [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c]),
  ) as unknown as Mat3;

function invert(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [C / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

/** Linear sRGB -> CIE XYZ (D65), IEC 61966-2-1. */
const SRGB_TO_XYZ: Mat3 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

const BRADFORD: Mat3 = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];

const WHITE_D65 = apply(SRGB_TO_XYZ, [1, 1, 1]);

/** Von Kries adaptation in the Bradford cone space, from one white to another. */
function bradford(from: Vec3, to: Vec3): Mat3 {
  const s = apply(BRADFORD, from);
  const d = apply(BRADFORD, to);
  const scale: Mat3 = [
    [d[0] / s[0], 0, 0],
    [0, d[1] / s[1], 0],
    [0, 0, d[2] / s[2]],
  ];
  return multiply(invert(BRADFORD), multiply(scale, BRADFORD));
}

const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const fInv = (v: number) => (v * v * v > EPSILON ? v * v * v : (116 * v - 16) / KAPPA);

export interface CielabSpace {
  /** XYZ of the white, Y = 1. */
  white: Vec3;
  toOklab(lab: Vec3): Vec3;
  fromOklab(lab: Vec3): Vec3;
  /** OKLab -> CIELAB written into `out`, for per-sample loops. */
  fromOklabInto(L: number, a: number, b: number, out: Vec3): Vec3;
}

export function cielabSpace(white: Vec3): CielabSpace {
  const xyzToLinear = multiply(invert(SRGB_TO_XYZ), bradford(white, WHITE_D65));
  const linearToXyz = invert(xyzToLinear);
  const fromOklabInto = (L: number, a: number, b: number, out: Vec3): Vec3 => {
    const [x, y, z] = apply(linearToXyz, oklabToLinearSrgbInto(L, a, b, out));
    const fx = f(x / white[0]);
    const fy = f(y / white[1]);
    const fz = f(z / white[2]);
    out[0] = 116 * fy - 16;
    out[1] = 500 * (fx - fy);
    out[2] = 200 * (fy - fz);
    return out;
  };
  return {
    white,
    toOklab([Lstar, a, b]) {
      const fy = (Lstar + 16) / 116;
      const xyz: Vec3 = [white[0] * fInv(fy + a / 500), white[1] * fInv(fy), white[2] * fInv(fy - b / 200)];
      return linearSrgbToOklab(apply(xyzToLinear, xyz));
    },
    fromOklab: ([L, a, b]) => fromOklabInto(L, a, b, [0, 0, 0]),
    fromOklabInto,
  };
}

const xy = (x: number, y: number): Vec3 => [x / y, 1, (1 - x - y) / y];

/** Illuminant C, CIE 1931 2° observer: the white of Pointer's gamut. */
export const CIELAB_C = cielabSpace(xy(0.310056734303928, 0.316145704789204));

/** D50 as ICC profiles define it: the white of the paint data's `cielab`. */
export const CIELAB_D50 = cielabSpace([0.9642, 1, 0.8249]);
