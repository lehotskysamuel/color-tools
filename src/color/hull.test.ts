import { describe, expect, it } from 'vitest';
import { convexHull, hullContains, hullVolume } from './hull';
import type { Vec3 } from './oklab';

const cube: Vec3[] = [];
for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) cube.push([x, y, z]);

function randomPoints(n: number, seed: number): Vec3[] {
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  return Array.from({ length: n }, () => [rand() - 0.5, rand() - 0.5, rand() - 0.5] as Vec3);
}

describe('convexHull', () => {
  it('needs four points that do not lie in one plane', () => {
    expect(convexHull(cube.slice(0, 3))).toBeNull();
    expect(convexHull(cube.filter((p) => p[2] === 0).concat([[0.5, 0.5, 0]]))).toBeNull();
    expect(convexHull([[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4]])).toBeNull();
  });

  it('finds the corners of a cube and ignores points inside it or on its faces', () => {
    const points: Vec3[] = [[0.5, 0.5, 0.5], ...cube, [0.5, 0.5, 1], [0.2, 0.9, 0.4], [0, 0.5, 0.5]];
    const hull = convexHull(points)!;
    expect(hull.vertices.map((i) => points[i]).sort()).toEqual([...cube].sort());
    expect(hull.faces).toHaveLength(12);
    expect(hullVolume(hull, points)).toBeCloseTo(1, 12);
  });

  it('tells inside from outside', () => {
    const hull = convexHull(cube)!;
    expect(hullContains(hull, 0.5, 0.5, 0.5)).toBe(true);
    expect(hullContains(hull, 1, 1, 1)).toBe(true);
    expect(hullContains(hull, 1.01, 0.5, 0.5)).toBe(false);
    expect(hullContains(hull, 0.5, -0.01, 0.5)).toBe(false);
  });

  it('wraps random points: every point inside, every face a supporting plane with outward normal', () => {
    for (const seed of [1, 7, 42]) {
      const points = randomPoints(300, seed);
      const hull = convexHull(points)!;
      for (const p of points) expect(hullContains(hull, ...p, 1e-12)).toBe(true);
      hull.faces.forEach((face, f) => {
        const [nx, ny, nz, d] = hull.planes.slice(f * 4, f * 4 + 4);
        for (const v of face) expect(nx * points[v][0] + ny * points[v][1] + nz * points[v][2]).toBeCloseTo(d, 12);
      });
      // A closed surface: every edge is shared by exactly two faces, in opposite directions.
      const edges = new Set(hull.faces.flatMap(([a, b, c]) => [`${a},${b}`, `${b},${c}`, `${c},${a}`]));
      for (const edge of edges) expect(edges.has(edge.split(',').reverse().join(','))).toBe(true);
      expect(hullVolume(hull, points)).toBeGreaterThan(0);
      expect(hullVolume(hull, points)).toBeLessThan(1);
    }
  });
});
