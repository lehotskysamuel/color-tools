import { describe, expect, it } from 'vitest';
import { CIELAB_C, CIELAB_D50 } from './cielab';
import { type Vec3, hexToLinear, linearSrgbToOklab } from './oklab';

describe.each([
  ['illuminant C', CIELAB_C],
  ['D50', CIELAB_D50],
])('CIELAB (%s) and OKLab', (_name, space) => {
  it('adapts the white to D65, so neutrals stay neutral and white is OKLab white', () => {
    const white = space.toOklab([100, 0, 0]);
    expect(white[0]).toBeCloseTo(1, 6);
    expect(Math.hypot(white[1], white[2])).toBeLessThan(1e-6);
    for (const L of [10, 50, 90]) {
      const gray = space.toOklab([L, 0, 0]);
      expect(Math.hypot(gray[1], gray[2])).toBeLessThan(1e-6);
      // For neutrals OKLab L is the cube root of Y, and so is (L* + 16) / 116 above L* 8.
      expect(gray[0]).toBeCloseTo((L + 16) / 116, 5);
    }
  });

  // The sRGB and OKLab matrices carry 7 to 10 digits, which is 1e-5 in CIELAB units.
  it('round-trips', () => {
    for (const lab of [[60, 40, -30], [20, -10, 5], [85, 5, 90]] as Vec3[]) {
      const back = space.fromOklab(space.toOklab(lab));
      for (let k = 0; k < 3; k++) expect(back[k]).toBeCloseTo(lab[k], 4);
    }
  });
});

describe('CIELAB D50', () => {
  // Reference: sRGB primaries in CIELAB D50 with Bradford adaptation (Lindbloom's calculator, ICC practice).
  it.each([
    ['#ff0000', 54.29, 80.81, 69.89],
    ['#00ff00', 87.82, -79.29, 80.99],
    ['#0000ff', 29.57, 68.3, -112.03],
  ])('puts %s where color-managed software does', (hex, L, a, b) => {
    const lab = CIELAB_D50.fromOklab(linearSrgbToOklab(hexToLinear(hex)));
    expect(lab[0]).toBeCloseTo(L, 1);
    expect(lab[1]).toBeCloseTo(a, 1);
    expect(lab[2]).toBeCloseTo(b, 1);
  });
});
