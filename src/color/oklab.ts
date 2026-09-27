/**
 * OKLab / OKLCh color math (Björn Ottosson, 2020) against the sRGB gamut.
 *
 * Conventions used throughout the app:
 *   - OKLab:  L in [0, 1], a and b roughly in [-0.4, 0.4]
 *   - OKLCh:  L in [0, 1], C >= 0, h in degrees [0, 360)
 *   - "linear" means linear-light sRGB (no transfer function), each channel in [0, 1] when in gamut
 *   - Euclidean distance in OKLab is the perceptual difference (ΔE_OK)
 *
 * Reference: https://bottosson.github.io/posts/oklab/
 */

export type Vec3 = [number, number, number];

/**
 * Channel tolerance when deciding whether a linear sRGB value is displayable. It only needs to absorb
 * float error (round trips are good to ~1e-7). Larger values visibly fatten the gamut's edges: all pure
 * blues (0, 0, t) share one OKLab hue, so a hue slice a few hundredths of a degree away passes within
 * 1e-4 of that edge and would show a phantom sliver.
 */
export const GAMUT_EPSILON = 1e-6;

/** Half-width of the a/b range the views draw. sRGB's most chromatic color (magenta) has C ≈ 0.322. */
export const AB_RANGE = 0.34;

export function srgbToLinear(c: number): number {
  const abs = Math.abs(c);
  const v = abs <= 0.04045 ? abs / 12.92 : Math.pow((abs + 0.055) / 1.055, 2.4);
  return Math.sign(c) * v;
}

export function linearToSrgb(c: number): number {
  const abs = Math.abs(c);
  const v = abs <= 0.0031308 ? abs * 12.92 : 1.055 * Math.pow(abs, 1 / 2.4) - 0.055;
  return Math.sign(c) * v;
}

export function linearSrgbToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * OKLab -> linear sRGB, written into `out` to avoid allocations in per-pixel loops.
 * Values outside [0, 1] mean the color is outside the sRGB gamut.
 */
export function oklabToLinearSrgbInto(L: number, a: number, b: number, out: Vec3): Vec3 {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  out[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  out[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  out[2] = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return out;
}

export function oklabToLinearSrgb([L, a, b]: Vec3): Vec3 {
  return oklabToLinearSrgbInto(L, a, b, [0, 0, 0]);
}

export function oklabToOklch([L, a, b]: Vec3): Vec3 {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

export function oklchToOklab([L, C, h]: Vec3): Vec3 {
  const rad = (h * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

export function isLinearInGamut([r, g, b]: Vec3, eps = GAMUT_EPSILON): boolean {
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}

export function isOklabInGamut(lab: Vec3, eps = GAMUT_EPSILON): boolean {
  return isLinearInGamut(oklabToLinearSrgb(lab), eps);
}

/** Perceptual difference between two OKLab colors. ~0.02 is roughly one just-noticeable difference. */
export function deltaEOK(p: Vec3, q: Vec3): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * Largest chroma that stays inside sRGB for a given lightness and hue.
 * For a fixed L and h the in-gamut chroma values form a single interval [0, Cmax],
 * so bisection is exact to the chosen precision.
 */
export function maxChroma(L: number, hDeg: number): number {
  if (L <= 0 || L >= 1) return 0;
  const rad = (hDeg * Math.PI) / 180;
  const ca = Math.cos(rad);
  const sb = Math.sin(rad);
  const out: Vec3 = [0, 0, 0];
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    oklabToLinearSrgbInto(L, mid * ca, mid * sb, out);
    if (isLinearInGamut(out, 0)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The "cusp" of a hue: the lightness at which that hue reaches its highest in-gamut chroma. */
export function findCusp(hDeg: number, steps = 400): { L: number; C: number } {
  let best = { L: 0, C: 0 };
  for (let i = 1; i < steps; i++) {
    const L = i / steps;
    const C = maxChroma(L, hDeg);
    if (C > best.C) best = { L, C };
  }
  // Refine around the coarse maximum (golden-section search on a unimodal interval).
  let lo = Math.max(0, best.L - 1 / steps);
  let hi = Math.min(1, best.L + 1 / steps);
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const x1 = hi - phi * (hi - lo);
    const x2 = lo + phi * (hi - lo);
    if (maxChroma(x1, hDeg) < maxChroma(x2, hDeg)) lo = x1;
    else hi = x2;
  }
  const L = (lo + hi) / 2;
  return { L, C: maxChroma(L, hDeg) };
}

export function hexToLinear(hex: string): Vec3 {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Expected a 6-digit hex color like #3a7bd5, got "${hex}"`);
  const n = parseInt(m[1], 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

/** "#rrggbb" -> OKLCh. Hue is still computed for neutrals, where it carries no meaning. */
export function hexToOklch(hex: string): Vec3 {
  return oklabToOklch(linearSrgbToOklab(hexToLinear(hex)));
}

/** Linear sRGB -> "#rrggbb". Out-of-gamut channels are clamped. */
export function linearToHex(rgb: Vec3): string {
  return (
    '#' +
    rgb
      .map((c) => {
        const v = Math.round(Math.min(1, Math.max(0, linearToSrgb(c))) * 255);
        return v.toString(16).padStart(2, '0');
      })
      .join('')
  );
}

export function oklabToHex(lab: Vec3): string {
  return linearToHex(oklabToLinearSrgb(lab));
}

export function formatOklch([L, C, h]: Vec3): string {
  // Hue is meaningless for neutrals; CSS writes it as "none", we show 0 to keep columns aligned.
  const hue = C < 1e-4 ? 0 : h;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue.toFixed(1)})`;
}

export function formatOklab([L, a, b]: Vec3): string {
  return `oklab(${L.toFixed(3)} ${a.toFixed(3)} ${b.toFixed(3)})`;
}

/**
 * Fast linear-light -> 8-bit sRGB encoder for per-pixel loops.
 * 16k entries keep the error below a fifth of an 8-bit step even near black.
 */
const LUT_SIZE = 16384;
const ENCODE_LUT = (() => {
  const lut = new Uint8ClampedArray(LUT_SIZE + 1);
  for (let i = 0; i <= LUT_SIZE; i++) lut[i] = Math.round(linearToSrgb(i / LUT_SIZE) * 255);
  return lut;
})();

export function encodeLinear8(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 255;
  return ENCODE_LUT[Math.round(c * LUT_SIZE)];
}
