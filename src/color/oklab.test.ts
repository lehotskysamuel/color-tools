import { describe, expect, it } from 'vitest';
import {
  type Vec3,
  deltaEOK,
  encodeLinear8,
  findCusp,
  hexToLinear,
  hexToOklch,
  isLinearInGamut,
  linearSrgbToOklab,
  linearToHex,
  linearToSrgb,
  maxChroma,
  oklabToLinearSrgb,
  oklabToOklch,
  oklchToOklab,
  srgbToLinear,
} from './oklab';

describe('sRGB transfer function', () => {
  it('round-trips', () => {
    for (let i = 0; i <= 255; i++) {
      const v = i / 255;
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 12);
    }
  });

  it('fast 8-bit encoder matches the exact curve', () => {
    for (let i = 0; i <= 1000; i++) {
      const lin = i / 1000;
      expect(Math.abs(encodeLinear8(lin) - Math.round(linearToSrgb(lin) * 255))).toBeLessThanOrEqual(1);
    }
  });
});

describe('OKLab conversion', () => {
  it('maps white to L=1 and black to L=0 with no chroma', () => {
    const white = linearSrgbToOklab([1, 1, 1]);
    expect(white[0]).toBeCloseTo(1, 6);
    expect(Math.hypot(white[1], white[2])).toBeLessThan(1e-6);
    expect(linearSrgbToOklab([0, 0, 0])).toEqual([0, 0, 0]);
  });

  // Reference values from CSS Color 4 (the named sRGB primaries expressed in oklch()).
  it.each([
    ['#ff0000', 0.62796, 0.25768, 29.234],
    ['#00ff00', 0.86644, 0.29483, 142.495],
    ['#0000ff', 0.45201, 0.31321, 264.052],
  ])('%s matches the CSS Color 4 reference', (hex, L, C, h) => {
    const [l, c, hh] = hexToOklch(hex);
    expect(l).toBeCloseTo(L, 4);
    expect(c).toBeCloseTo(C, 4);
    expect(hh).toBeCloseTo(h, 2);
  });

  // The published matrices carry 10 significant digits, so round trips hold to ~1e-7.
  it('round-trips random sRGB colors', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
    for (let i = 0; i < 1000; i++) {
      const rgb: Vec3 = [rand(), rand(), rand()];
      const back = oklabToLinearSrgb(linearSrgbToOklab(rgb));
      for (let k = 0; k < 3; k++) expect(back[k]).toBeCloseTo(rgb[k], 6);
    }
  });

  it('round-trips OKLab <-> OKLCh', () => {
    const lab: Vec3 = [0.6, -0.1, 0.05];
    const back = oklchToOklab(oklabToOklch(lab));
    for (let k = 0; k < 3; k++) expect(back[k]).toBeCloseTo(lab[k], 12);
  });

  it('formats hex', () => {
    expect(linearToHex(hexToLinear('#3a7bd5'))).toBe('#3a7bd5');
  });
});

describe('gamut boundary', () => {
  it.each(['#ff0000', '#00ff00', '#ffff00', '#00ffff', '#ff00ff'])(
    'finds the maximum chroma of %s at its own lightness and hue',
    (hex) => {
      const [L, C, h] = hexToOklch(hex);
      expect(maxChroma(L, h)).toBeCloseTo(C, 3);
    },
  );

  // The sRGB surface next to the blue primary is slightly concave in OKLab: walking from gray
  // toward #0000ff at constant L and h, red dips to about -0.0007 before returning to 0 exactly
  // at the primary. The ray therefore leaves the gamut at C ≈ 0.266 and only touches pure blue
  // at its tip. The views render every pixel independently, so this shows up as a thin spike.
  it('treats pure blue as a point the constant-hue ray only grazes', () => {
    const [L, C, h] = hexToOklch('#0000ff');
    const cMax = maxChroma(L, h);
    expect(cMax).toBeGreaterThan(0.26);
    expect(cMax).toBeLessThan(C - 0.04);
    const midway = oklabToLinearSrgb(oklchToOklab([L, (cMax + C) / 2, h]));
    expect(isLinearInGamut(midway, 0)).toBe(false);
  });

  it('returns a chroma that is just inside the gamut', () => {
    for (const L of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (let h = 0; h < 360; h += 15) {
        const C = maxChroma(L, h);
        const inside = oklabToLinearSrgb(oklchToOklab([L, C, h]));
        const outside = oklabToLinearSrgb(oklchToOklab([L, C + 1e-4, h]));
        expect(isLinearInGamut(inside, 1e-7)).toBe(true);
        expect(isLinearInGamut(outside, 0)).toBe(false);
      }
    }
  });

  // Bisection assumes each (L, h) ray leaves the gamut exactly once. Check that by brute force.
  it('in-gamut chroma along every (L, h) ray is one contiguous interval', () => {
    for (let L = 0.02; L < 1; L += 0.04) {
      for (let h = 0; h < 360; h += 5) {
        let left = false;
        for (let C = 0; C <= 0.4; C += 0.001) {
          const inGamut = isLinearInGamut(oklabToLinearSrgb(oklchToOklab([L, C, h])), 0);
          if (!inGamut) left = true;
          else expect(left).toBe(false);
        }
      }
    }
  });

  it.each(['#ff0000', '#00ff00', '#ffff00', '#00ffff', '#ff00ff'])(
    'places the cusp of %s at the primary or secondary itself',
    (hex) => {
      const [L, C, h] = hexToOklch(hex);
      const cusp = findCusp(h);
      expect(cusp.L).toBeCloseTo(L, 2);
      expect(cusp.C).toBeCloseTo(C, 3);
    },
  );
});

describe('ΔE_OK', () => {
  it('equals the Euclidean distance in OKLab', () => {
    expect(deltaEOK([0.5, 0, 0], [0.5, 0.03, 0.04])).toBeCloseTo(0.05, 12);
  });
});
