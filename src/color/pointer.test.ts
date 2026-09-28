import { describe, expect, it } from 'vitest';
import { hexToLinear, linearSrgbToOklab, oklchToOklab } from './oklab';
import { CIELAB_C } from './cielab';
import { isOklabInPointer, maxPointerChroma, pointerBoundary, pointerMaxChroma } from './pointer';

describe("Pointer's table", () => {
  it('returns the published values at the grid points', () => {
    expect(pointerMaxChroma(50, 50)).toBe(100);
    expect(pointerMaxChroma(90, 100)).toBe(108);
    expect(pointerMaxChroma(15, 210)).toBe(0);
    expect(pointerMaxChroma(15, 310)).toBe(62);
  });

  it('interpolates linearly in L* and in hue, across 0°', () => {
    expect(pointerMaxChroma(52.5, 50)).toBeCloseTo((100 + 102) / 2, 12);
    expect(pointerMaxChroma(50, 45)).toBeCloseTo((93 + 100) / 2, 12);
    expect(pointerMaxChroma(50, 355)).toBeCloseTo((84 + 77) / 2, 12);
    expect(pointerMaxChroma(50, 360)).toBe(pointerMaxChroma(50, 0));
  });

  it('tapers to black and white beyond the table', () => {
    expect(pointerMaxChroma(7.5, 310)).toBeCloseTo(31, 12);
    expect(pointerMaxChroma(95, 100)).toBeCloseTo(54, 12);
    for (const L of [-1, 0, 100, 101]) expect(pointerMaxChroma(L, 100)).toBe(0);
  });
});

describe("Pointer's gamut in OKLab", () => {
  it('puts each table point on the boundary', () => {
    for (const [L, h] of [[50, 40], [70, 70], [30, 310], [85, 90], [40, 180]]) {
      const C = pointerMaxChroma(L, h);
      const rad = (h * Math.PI) / 180;
      const at = (s: number) => CIELAB_C.toOklab([L, s * C * Math.cos(rad), s * C * Math.sin(rad)]);
      expect(isOklabInPointer(...at(0.99))).toBe(true);
      expect(isOklabInPointer(...at(1.01))).toBe(false);
      const edge = pointerBoundary(L, h);
      const expected = at(1);
      for (let k = 0; k < 3; k++) expect(edge[k]).toBeCloseTo(expected[k], 12);
    }
  });

  it('holds mid gray but not the sRGB blue primary, which no surface color matches', () => {
    expect(isOklabInPointer(0.5, 0, 0)).toBe(true);
    expect(isOklabInPointer(...linearSrgbToOklab(hexToLinear('#0000ff')))).toBe(false);
    expect(isOklabInPointer(0, 0, 0)).toBe(false);
    expect(isOklabInPointer(1, 0, 0)).toBe(false);
  });

  // Bisection in maxPointerChroma assumes each (L, h) ray leaves the gamut exactly once. Check that by brute force.
  it('along every OKLab (L, h) ray the chroma inside the gamut is one interval', () => {
    for (let L = 0.02; L < 1; L += 0.04) {
      for (let h = 0; h < 360; h += 5) {
        let left = false;
        for (let C = 0; C <= 0.35; C += 0.001) {
          const [l, a, b] = oklchToOklab([L, C, h]);
          if (!isOklabInPointer(l, a, b)) left = true;
          else expect(left).toBe(false);
        }
      }
    }
  });

  it('finds the boundary chroma at an OKLab lightness and hue', () => {
    for (const L of [0.2, 0.5, 0.8]) {
      for (let h = 0; h < 360; h += 30) {
        const C = maxPointerChroma(L, h);
        expect(isOklabInPointer(...oklchToOklab([L, C, h]))).toBe(true);
        expect(isOklabInPointer(...oklchToOklab([L, C + 1e-4, h]))).toBe(false);
      }
    }
  });
});
