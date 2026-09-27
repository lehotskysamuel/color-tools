// Chroma below this is treated as achromatic: its hue is undefined (null).
const ACHROMATIC_CHROMA = 1e-4;

/**
 * Parse "#RRGGBB", "RRGGBB" or "#RGB" into 0–255 channels.
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
export function parseHex(hex) {
  let digits = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(digits)) {
    digits = [...digits].map((d) => d + d).join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(digits)) {
    throw new TypeError(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

function toRgb(rgb) {
  return typeof rgb === 'string' ? parseHex(rgb) : rgb;
}

function srgbToLinear(channel) {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * Convert sRGB to OKLCH.
 * Uses Björn Ottosson's OKLab matrices (https://bottosson.github.io/posts/oklab/).
 * @param {string | { r: number, g: number, b: number }} rgb hex string or 0–255 channels
 * @returns {{ l: number, c: number, h: number | null }} l in 0–1, h in degrees 0–360,
 *   null for achromatic colors
 */
export function rgbToOklch(rgb) {
  const { r, g, b } = toRgb(rgb);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.hypot(A, B);
  let h = null;
  if (c >= ACHROMATIC_CHROMA) {
    h = (Math.atan2(B, A) * 180) / Math.PI;
    if (h < 0) h += 360;
  }
  return { l: L, c, h };
}
