/**
 * Convex hull of a point set in 3D, for the gamut spanned by a set of colors. Built incrementally: each
 * point outside the current hull removes the faces it can see and is joined to their horizon.
 * Cost is O(n · faces), which is instant for a few hundred paints.
 */
import type { Vec3 } from './oklab';

export interface Hull {
  /** Indices into the input points, three per face, counter-clockwise seen from outside. */
  faces: readonly (readonly [number, number, number])[];
  /** Per face: outward unit normal (x, y, z) and offset d. A point p is inside when n·p <= d for every face. */
  planes: Float64Array;
  /** Indices of the input points that are hull vertices. */
  vertices: readonly number[];
}

/** Points closer than this to a face plane count as on it, in the points' units (OKLab here). */
const EPS = 1e-9;

const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (p: Vec3, q: Vec3): Vec3 => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

interface Face {
  v: [number, number, number];
  n: Vec3;
  d: number;
}

/** Null when there are fewer than 4 points or they all lie on one plane. */
export function convexHull(points: readonly Vec3[]): Hull | null {
  if (points.length < 4) return null;
  const face = (a: number, b: number, c: number): Face => {
    const n = cross(sub(points[b], points[a]), sub(points[c], points[a]));
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const unit: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
    return { v: [a, b, c], n: unit, d: dot(unit, points[a]) };
  };
  const dist = (f: Face, p: Vec3) => dot(f.n, p) - f.d;

  // Initial tetrahedron from extreme points, so it is as large as possible and never degenerate.
  let i0 = 0;
  for (let i = 1; i < points.length; i++) if (points[i][0] < points[i0][0]) i0 = i;
  const farthest = (score: (p: Vec3) => number) => {
    let best = -1;
    let bestScore = EPS;
    points.forEach((p, i) => {
      const s = score(p);
      if (s > bestScore) [best, bestScore] = [i, s];
    });
    return best;
  };
  const i1 = farthest((p) => Math.hypot(...sub(p, points[i0])));
  if (i1 < 0) return null;
  const axis = sub(points[i1], points[i0]);
  const i2 = farthest((p) => Math.hypot(...cross(axis, sub(p, points[i0]))) / Math.hypot(...axis));
  if (i2 < 0) return null;
  const base = face(i0, i1, i2);
  const i3 = farthest((p) => Math.abs(dist(base, p)));
  if (i3 < 0) return null;

  let faces: Face[] =
    dist(base, points[i3]) < 0
      ? [face(i0, i1, i2), face(i0, i3, i1), face(i1, i3, i2), face(i2, i3, i0)]
      : [face(i0, i2, i1), face(i0, i1, i3), face(i1, i2, i3), face(i2, i0, i3)];

  for (let p = 0; p < points.length; p++) {
    if (p === i0 || p === i1 || p === i2 || p === i3) continue;
    const visible = faces.filter((f) => dist(f, points[p]) > EPS);
    if (visible.length === 0) continue;
    // The horizon is every edge of the visible region whose twin belongs to a face that stays.
    const edges = new Set<string>();
    for (const { v } of visible) for (let k = 0; k < 3; k++) edges.add(`${v[k]},${v[(k + 1) % 3]}`);
    const kept = faces.filter((f) => !visible.includes(f));
    for (const { v } of visible) {
      for (let k = 0; k < 3; k++) {
        const [a, b] = [v[k], v[(k + 1) % 3]];
        // Same edge direction as the removed face, so the new face keeps its outward orientation.
        if (!edges.has(`${b},${a}`)) kept.push(face(a, b, p));
      }
    }
    faces = kept;
  }

  const planes = new Float64Array(faces.length * 4);
  faces.forEach(({ n, d }, i) => planes.set([n[0], n[1], n[2], d], i * 4));
  return {
    faces: faces.map((f) => f.v),
    planes,
    vertices: [...new Set(faces.flatMap((f) => f.v))],
  };
}

export function hullContains(hull: Hull, x: number, y: number, z: number, eps = EPS): boolean {
  const pl = hull.planes;
  for (let i = 0; i < pl.length; i += 4) {
    if (pl[i] * x + pl[i + 1] * y + pl[i + 2] * z > pl[i + 3] + eps) return false;
  }
  return true;
}

/** Enclosed volume, from the divergence theorem over the outward-oriented faces. */
export function hullVolume(hull: Hull, points: readonly Vec3[]): number {
  let v = 0;
  for (const [a, b, c] of hull.faces) v += dot(points[a], cross(points[b], points[c]));
  return v / 6;
}
