import { describe, expect, it } from 'vitest';
import { PAINTS } from '../paints/vallejo';
import { colorSetCoverage, hullCoverage, srgbShareOfPointer } from './coverage';
import { convexHull } from './hull';
import { type Vec3, isOklabInGamut } from './oklab';
import { pointerBoundary } from './pointer';

const box = (L0: number, L1: number, ab: number): Vec3[] =>
  [L0, L1].flatMap((L) => [-ab, ab].flatMap((a) => [-ab, ab].map((b) => [L, a, b] as Vec3)));

describe('coverage', () => {
  it('measures volume: a box twice as tall covers twice as much', () => {
    const tall = box(0.45, 0.65, 0.03);
    for (const p of tall) expect(isOklabInGamut(p)).toBe(true);
    const ratio = hullCoverage('srgb', convexHull(tall)!) / hullCoverage('srgb', convexHull(box(0.45, 0.55, 0.03))!);
    expect(ratio).toBeCloseTo(2, 2);
  });

  // The hull of any sample of the boundary lies a little inside it between samples, so sample finely.
  it("covers all of Pointer's gamut with the hull of its own boundary", () => {
    const boundary: Vec3[] = [];
    for (let L = 0; L <= 100; L += 2.5) for (let h = 0; h < 360; h += 2) boundary.push(pointerBoundary(L, h));
    expect(hullCoverage('pointer', convexHull(boundary)!)).toBeGreaterThan(0.999);
  });

  it('gives no coverage for colors that enclose no volume', () => {
    expect(colorSetCoverage([])).toBeNull();
    expect(colorSetCoverage(box(0.5, 0.5, 0.03))).toBeNull();
    expect(colorSetCoverage(box(0.45, 0.65, 0.03))).toBeGreaterThan(0);
  });

  // Regression values for the figures the page and scripts/coverage.js show; see the README for how they are defined.
  it("puts sRGB at 78% of Pointer's gamut and Game Color with Model Color at 53%", () => {
    expect(srgbShareOfPointer()).toBeCloseTo(0.779, 2);
    const charts = [...PAINTS.values()].filter((p) => p.range === 'Game Color' || p.range === 'Model Color');
    const all = charts.map((p) => p.lab);
    expect(colorSetCoverage(all)).toBeCloseTo(0.526, 2);
    expect(colorSetCoverage(all, 'srgb')).toBeCloseTo(0.51, 2);
  });
});
