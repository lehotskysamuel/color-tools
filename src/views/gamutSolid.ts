import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Plane,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { hullCoverage, srgbShareOfPointer } from '../color/coverage';
import { type Hull, convexHull } from '../color/hull';
import {
  AB_RANGE,
  type Vec3,
  deltaEOK,
  isOklabInGamut,
  linearSrgbToOklab,
  maxChroma,
  oklabToDisplayLinear,
  oklabToDisplayLinearInto,
  oklabToOklch,
  oklchToOklab,
  srgbToLinear,
} from '../color/oklab';
import { maxPointerChroma, pointerBoundary } from '../color/pointer';
import type { Paint } from '../paints/vallejo';
import { type AppState, type CutMode, type Gamut, MIN_HULL_PAINTS, type Store, pickPaint } from '../state';
import type { HoverHandler } from './slicePlot';

/** Grid resolution per face of the RGB cube. */
const FACE_STEPS = 64;
/** World units visible vertically at zoom 1. The solid is 1 tall (L 0..1). */
const VIEW_HEIGHT = 1.2;
const TARGET = new Vector3(0, 0.5, 0);

/**
 * Scene axes: x = a, y = L, z = -b. With this handedness, looking straight down
 * shows the a/b plane in the same orientation as view B.1 (+a right, +b up).
 */
const labToScene = ([L, a, b]: Vec3) => new Vector3(a, L, -b);
const sceneToLab = (p: Vector3): Vec3 => [p.y, p.x, -p.z];

/** Paint dots: diameter of the rim and of the color inside it, and the pointer hit radius, in CSS pixels. */
const DOT_RIM = 9;
const DOT_FILL = 6;
const DOT_HIT = 6;

/** Surface of the sRGB cube mapped into OKLab, colored with its own colors. */
function buildGamutGeometry(steps: number): BufferGeometry {
  const perFace = (steps + 1) * (steps + 1);
  const positions = new Float32Array(6 * perFace * 3);
  const colors = new Float32Array(6 * perFace * 3);
  const indices: number[] = [];
  let v = 0;
  for (let axis = 0; axis < 3; axis++) {
    for (const fixed of [0, 1]) {
      const base = v;
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps; j++) {
          // Uniform steps in gamma-encoded sRGB spread vertices evenly in OKLab lightness.
          const u = srgbToLinear(i / steps);
          const w = srgbToLinear(j / steps);
          const rgb: Vec3 = axis === 0 ? [fixed, u, w] : axis === 1 ? [u, fixed, w] : [u, w, fixed];
          const lab = linearSrgbToOklab(rgb);
          positions.set([lab[1], lab[0], -lab[2]], v * 3);
          // three.js treats vertex colors as linear-light, which is exactly what `rgb` is.
          colors.set(rgb, v * 3);
          v++;
        }
      }
      for (let i = 0; i < steps; i++) {
        for (let j = 0; j < steps; j++) {
          const a = base + i * (steps + 1) + j;
          const b = a + 1;
          const c = a + steps + 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Lightness step of the cage's rings and hue step of its meridians. */
const CAGE_L_STEP = 0.1;
const CAGE_H_STEP = 30;

/** Line segments through OKLab points, every vertex in its own color. */
function polylineGeometry(lines: Vec3[][]): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const labs of lines) {
    for (let i = 1; i < labs.length; i++) {
      for (const lab of [labs[i - 1], labs[i]]) {
        positions.push(lab[1], lab[0], -lab[2]);
        colors.push(...oklabToDisplayLinear(lab));
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  return geometry;
}

/** Largest in-gamut chroma at an OKLab lightness and hue, per gamut. */
const MAX_CHROMA: Record<Gamut, (L: number, h: number) => number> = {
  srgb: maxChroma,
  pointer: maxPointerChroma,
};

/**
 * The wireframe: the gamut boundary traced along OKLCh lines, so the cage matches the slices.
 * Rings at constant L are what B.1 outlines, meridians at constant h what B.2 outlines. For sRGB the 12
 * edges of the RGB cube add the solid's creases, such as the ridge through the six primaries and
 * secondaries. Every vertex has its own color, as on the solid.
 */
function buildCageGeometry(gamut: Gamut): BufferGeometry {
  const cmax = MAX_CHROMA[gamut];
  const boundary = (L: number, h: number) => oklchToOklab([L, cmax(L, h), h]);
  const lines: Vec3[][] = [];

  for (let L = CAGE_L_STEP; L < 1 - 1e-9; L += CAGE_L_STEP) {
    const ring: Vec3[] = [];
    for (let h = 0; h <= 360; h += 2) ring.push(boundary(L, h));
    lines.push(ring);
  }
  for (let h = 0; h < 360; h += CAGE_H_STEP) {
    const meridian: Vec3[] = [];
    for (let i = 0; i <= 200; i++) meridian.push(boundary(i / 200, h));
    lines.push(meridian);
  }
  if (gamut === 'srgb') {
    const corners: Vec3[] = [
      [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
      [1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1],
    ];
    for (let i = 0; i < corners.length; i++) {
      for (let j = i + 1; j < corners.length; j++) {
        const [p, q] = [corners[i], corners[j]];
        // Cube edges are the corner pairs that differ in exactly one channel.
        if (p.filter((c, k) => c !== q[k]).length !== 1) continue;
        const edge: Vec3[] = [];
        for (let t = 0; t <= 32; t++) {
          // Uniform in gamma-encoded sRGB, like the solid's grid.
          const s = srgbToLinear(t / 32);
          edge.push(linearSrgbToOklab(p.map((c, k) => c + (q[k] - c) * s) as Vec3));
        }
        lines.push(edge);
      }
    }
  }
  return polylineGeometry(lines);
}

/**
 * Surface of Pointer's gamut on the grid of its own table: every 1 L* and 2° of CIELAB hue, so each
 * table row and column is a line of vertices. Rows L* 0 and 100 collapse to the black and white points.
 */
function buildPointerGeometry(): BufferGeometry {
  const rows = 101;
  const cols = 180;
  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
  const indices: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const lab = pointerBoundary(i, j * 2);
      const v = i * cols + j;
      positions.set([lab[1], lab[0], -lab[2]], v * 3);
      colors.set(oklabToDisplayLinear(lab), v * 3);
      if (i === 0) continue;
      const a = v - cols;
      const b = (i - 1) * cols + ((j + 1) % cols);
      indices.push(a, v, b, b, v, b + cols);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Hull faces are split into cells about this long, in OKLab units, and every cell corner gets the color of
 * its own position. The faces are flat in OKLab, but their colors are not linear across them.
 */
const HULL_CELL = 0.03;

/** The hull's faces as they are: few, large triangles. Picking uses it, since subdividing changes no position. */
function hullFaceGeometry(points: readonly Vec3[], hull: Hull): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(points.length * 3);
  points.forEach((p, i) => positions.set(labToScene(p).toArray(), i * 3));
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(hull.faces.flat());
  geometry.computeBoundingSphere();
  return geometry;
}

/** The hull's faces, each split into a triangular grid of cells in the colors of their own positions. */
function buildHullGeometry(points: readonly Vec3[], hull: Hull): BufferGeometry {
  // One split count for every face, so the faces on both sides of an edge split it at the same points.
  let longest = 0;
  for (const f of hull.faces) {
    for (let k = 0; k < 3; k++) longest = Math.max(longest, deltaEOK(points[f[k]], points[f[(k + 1) % 3]]));
  }
  const n = Math.max(1, Math.ceil(longest / HULL_CELL));
  const perFace = ((n + 1) * (n + 2)) / 2;
  const positions = new Float32Array(hull.faces.length * perFace * 3);
  const colors = new Float32Array(hull.faces.length * perFace * 3);
  const indices = new Uint32Array(hull.faces.length * n * n * 3);
  const rgb: Vec3 = [0, 0, 0];
  let t = 0;
  // Vertex (i, j) of a face: A + i/n (B - A) + j/n (C - A), for i + j <= n.
  const at = (base: number, i: number, j: number) => base + i * (n + 1) - (i * (i - 1)) / 2 + j;
  hull.faces.forEach(([ia, ib, ic], f) => {
    const [A, B, C] = [points[ia], points[ib], points[ic]];
    const base = f * perFace;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; i + j <= n; j++) {
        const L = A[0] + ((B[0] - A[0]) * i + (C[0] - A[0]) * j) / n;
        const a = A[1] + ((B[1] - A[1]) * i + (C[1] - A[1]) * j) / n;
        const b = A[2] + ((B[2] - A[2]) * i + (C[2] - A[2]) * j) / n;
        const v = at(base, i, j);
        positions[v * 3] = a;
        positions[v * 3 + 1] = L;
        positions[v * 3 + 2] = -b;
        colors.set(oklabToDisplayLinearInto(L, a, b, rgb), v * 3);
        if (i + j === n) continue;
        indices.set([v, at(base, i + 1, j), at(base, i, j + 1)], t);
        t += 3;
        if (i + j + 1 < n) {
          indices.set([at(base, i + 1, j), at(base, i + 1, j + 1), at(base, i, j + 1)], t);
          t += 3;
        }
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The hull's edges, leaving out the diagonals between faces that lie in one plane. */
function buildHullWireGeometry(points: readonly Vec3[], hull: Hull): BufferGeometry {
  const edgeFaces = new Map<string, number[]>();
  hull.faces.forEach(([a, b, c], f) => {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = p < q ? `${p},${q}` : `${q},${p}`;
      edgeFaces.set(key, [...(edgeFaces.get(key) ?? []), f]);
    }
  });
  const pl = hull.planes;
  const lines: Vec3[][] = [];
  for (const [key, [f, g]] of edgeFaces) {
    const cos = pl[f * 4] * pl[g * 4] + pl[f * 4 + 1] * pl[g * 4 + 1] + pl[f * 4 + 2] * pl[g * 4 + 2];
    if (cos > 1 - 1e-9) continue;
    const [P, Q] = key.split(',').map((i) => points[Number(i)]);
    const steps = Math.max(1, Math.ceil(deltaEOK(P, Q) / HULL_CELL));
    const line: Vec3[] = [];
    for (let t = 0; t <= steps; t++) line.push([0, 1, 2].map((k) => P[k] + ((Q[k] - P[k]) * t) / steps) as Vec3);
    lines.push(line);
  }
  return polylineGeometry(lines);
}

/** Where a plane cuts a triangle mesh, as line segments (pairs of points). Exact for the flat hull faces. */
function planeSection(geometry: BufferGeometry, plane: Plane): Vector3[] {
  const pos = geometry.getAttribute('position') as BufferAttribute | undefined;
  const index = geometry.getIndex();
  const out: Vector3[] = [];
  if (!pos || !index) return out;
  const ps = [new Vector3(), new Vector3(), new Vector3()];
  const d = [0, 0, 0];
  for (let t = 0; t < index.count; t += 3) {
    for (let k = 0; k < 3; k++) {
      ps[k].fromBufferAttribute(pos, index.getX(t + k));
      d[k] = plane.distanceToPoint(ps[k]);
    }
    const cut: Vector3[] = [];
    for (let k = 0; k < 3; k++) {
      const m = (k + 1) % 3;
      if (d[k] > 0 !== d[m] > 0) cut.push(ps[k].clone().lerp(ps[m], d[k] / (d[k] - d[m])));
    }
    if (cut.length === 2) out.push(...cut);
  }
  return out;
}

function makeMarker(radius: number): { group: Group; fill: MeshBasicMaterial; rim: MeshBasicMaterial } {
  const fill = new MeshBasicMaterial({ depthTest: false, depthWrite: false });
  const rim = new MeshBasicMaterial({ side: BackSide, depthTest: false, depthWrite: false });
  const inner = new Mesh(new SphereGeometry(radius, 20, 14), fill);
  const outer = new Mesh(new SphereGeometry(radius * 1.45, 20, 14), rim);
  outer.renderOrder = 10;
  inner.renderOrder = 11;
  const group = new Group();
  group.add(outer, inner);
  return { group, fill, rim };
}

/** A round point sprite; PointsMaterial multiplies it by each point's color. */
function discTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  return new CanvasTexture(canvas);
}

function makeDots(size: number, renderOrder: number, map: CanvasTexture): Points<BufferGeometry, PointsMaterial> {
  const dots = new Points(
    new BufferGeometry(),
    new PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map, alphaTest: 0.5 }),
  );
  dots.renderOrder = renderOrder;
  dots.frustumCulled = false;
  return dots;
}

function makeDashedSegments(): LineSegments<BufferGeometry, LineDashedMaterial> {
  return new LineSegments(new BufferGeometry(), new LineDashedMaterial({ dashSize: 0.012, gapSize: 0.008 }));
}

function clippedBy(point: Vector3, material: Material): boolean {
  const planes = material.clippingPlanes;
  if (!planes || planes.length === 0) return false;
  const outside = planes.map((p) => p.distanceToPoint(point) < -1e-6);
  return material.clipIntersection ? outside.every(Boolean) : outside.some(Boolean);
}

export class GamutSolid {
  onHover: HoverHandler | null = null;

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  /**
   * Drawn after the solid with a fresh depth buffer, so no paint dot is hidden inside the solid,
   * while the dots still hide each other by depth. The pick and hover markers go on top of everything.
   */
  private readonly overlay = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private readonly controls: OrbitControls;
  /** Each color space as an opaque surface and as a wire cage; the state picks one of the four. */
  private readonly spaces: Record<Gamut, { solid: Mesh<BufferGeometry, MeshBasicMaterial>; cage: LineSegments }>;
  /** Convex hull of the shown paints; its face indices refer to the order of `state.paints`. */
  private hull: Hull | null = null;
  private readonly hullSolid = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }),
  );
  private readonly hullWire = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ vertexColors: true }));
  /** The unsplit hull faces, never drawn: picking and the cut outlines work on these. */
  private readonly hullFaces = new Mesh(new BufferGeometry(), this.hullSolid.material);
  private readonly lightnessCap: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly hueCap: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly lightnessTexture: CanvasTexture;
  private readonly hueTexture: CanvasTexture;
  private readonly lightnessOutline = new Line(new BufferGeometry(), new LineBasicMaterial());
  private readonly hueOutline = new Line(new BufferGeometry(), new LineBasicMaterial());
  /** Where the cuts go through the paint hull. Dashed, to tell them from the color space's outline. */
  private readonly hullLightnessOutline = makeDashedSegments();
  private readonly hullHueOutline = makeDashedSegments();
  private readonly pickMarker = makeMarker(0.011);
  private readonly hoverMarker = makeMarker(0.008);
  private readonly dotTexture = discTexture();
  // The fill is drawn after the rim at the same depth; the default less-or-equal depth test lets it through.
  private readonly dotRims = makeDots(DOT_RIM, 1, this.dotTexture);
  private readonly dotFills = makeDots(DOT_FILL, 2, this.dotTexture);
  private paints: readonly Paint[] = [];
  private readonly raycaster = new Raycaster();

  // Clipping planes. three.js discards fragments on the negative side of a plane.
  private readonly keepBelowL = new Plane(new Vector3(0, -1, 0), 0.5);
  private readonly keepAboveL = new Plane(new Vector3(0, 1, 0), -0.5);
  private readonly keepFarFromCamera = new Plane(new Vector3(1, 0, 0), 0);
  private readonly keepNearCamera = new Plane(new Vector3(-1, 0, 0), 0);

  private width = 1;
  private height = 1;
  private frame = 0;
  private dragging = false;
  private pointerDown: { x: number; y: number } | null = null;
  private hoverFrame = 0;
  private lastPointer: PointerEvent | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
    lightnessImage: HTMLCanvasElement,
    hueImage: HTMLCanvasElement,
    /** Receives how much of the color space the paint hull covers. */
    private readonly stat: HTMLElement,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.className = 'solid-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      "Rotatable 3D model in OKLab, lightness pointing up: Pointer's gamut or the sRGB gamut, and the hull of the shown paints.",
    );
    host.appendChild(this.renderer.domElement);

    const space = (gamut: Gamut, surface: BufferGeometry) => {
      const solid = new Mesh(surface, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
      const cage = new LineSegments(buildCageGeometry(gamut), new LineBasicMaterial({ vertexColors: true }));
      this.scene.add(solid, cage);
      return { solid, cage };
    };
    this.spaces = {
      srgb: space('srgb', buildGamutGeometry(FACE_STEPS)),
      pointer: space('pointer', buildPointerGeometry()),
    };
    this.scene.add(this.hullSolid, this.hullWire);

    // The cut faces are the slice images from B.1 and B.2, so the three views always agree.
    this.lightnessTexture = new CanvasTexture(lightnessImage);
    this.hueTexture = new CanvasTexture(hueImage);
    for (const t of [this.lightnessTexture, this.hueTexture]) t.colorSpace = SRGBColorSpace;
    // Polygon offset pushes the caps back a hair so their outlines never z-fight with them.
    const capMaterial = (map: CanvasTexture) =>
      new MeshBasicMaterial({
        map,
        side: DoubleSide,
        alphaTest: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
    this.lightnessCap = new Mesh(new PlaneGeometry(2 * AB_RANGE, 2 * AB_RANGE), capMaterial(this.lightnessTexture));
    this.lightnessCap.rotation.x = -Math.PI / 2;
    this.hueCap = new Mesh(new PlaneGeometry(2 * AB_RANGE, 1), capMaterial(this.hueTexture));
    this.hueCap.position.set(0, 0.5, 0);
    this.scene.add(this.lightnessCap, this.hueCap, this.lightnessOutline, this.hueOutline);
    this.scene.add(this.hullLightnessOutline, this.hullHueOutline);

    // Neutral axis from black to white.
    const axis = new Line(
      new BufferGeometry().setFromPoints([new Vector3(0, -0.04, 0), new Vector3(0, 1.04, 0)]),
      new LineBasicMaterial({ color: 0x808080 }),
    );
    this.scene.add(axis);

    this.overlay.add(this.dotRims, this.dotFills, this.pickMarker.group, this.hoverMarker.group);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(TARGET);
    this.controls.enablePan = false;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 6;
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => {
      this.dragging = true;
      this.onHover?.(null, 0, 0);
    });
    this.controls.addEventListener('end', () => (this.dragging = false));

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.pointerDown = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const paint = this.paintAtPointer(e);
      if (paint) {
        pickPaint(this.store, paint);
        return;
      }
      const lab = this.labAtPointer(e);
      // Pointer's gamut and the hull reach outside sRGB, where there is no color to pick.
      if (!lab || !isOklabInGamut(lab)) return;
      const [L, C, h] = oklabToOklch(lab);
      this.store.set({ pick: lab, pickPaint: null, L, h: C > 1e-4 ? h : this.store.get().h });
    });
    el.addEventListener('pointermove', (e) => {
      if (this.dragging || e.buttons !== 0) return;
      this.lastPointer = e;
      if (this.hoverFrame) return;
      this.hoverFrame = requestAnimationFrame(() => {
        this.hoverFrame = 0;
        const ev = this.lastPointer;
        if (!ev) return;
        const paint = this.paintAtPointer(ev);
        if (paint) this.onHover?.(paint.lab, ev.clientX, ev.clientY, paint);
        else this.onHover?.(this.labAtPointer(ev), ev.clientX, ev.clientY);
      });
    });
    el.addEventListener('pointerleave', () => {
      this.lastPointer = null;
      this.onHover?.(null, 0, 0);
    });

    store.subscribe((state, changed) => this.sync(state, changed));
    this.sync(
      store.get(),
      new Set(['L', 'h', 'cut', 'gamut', 'gamutStyle', 'hull', 'hullStyle', 'pick', 'hover', 'paints']),
    );
    this.resetView();
  }

  /** Mark a slice texture as changed; called by the slice views after they re-render. */
  lightnessImageChanged(): void {
    this.refreshTexture(this.lightnessTexture);
  }

  hueImageChanged(): void {
    this.refreshTexture(this.hueTexture);
  }

  setSize(width: number, height: number): void {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.width, this.height);
    this.host.style.height = `${this.height}px`;
    this.updateCamera();
    this.requestRender();
  }

  /** Aim the camera into the wedge cut so both cut faces are visible, hue h on the right. */
  resetView(): void {
    const { h } = this.store.get();
    const rad = (h * Math.PI) / 180;
    const along = new Vector3(Math.cos(rad), 0, -Math.sin(rad)); // direction of hue h
    const toward = new Vector3(Math.sin(rad), 0, Math.cos(rad)); // side of the hue plane that gets removed
    const dir = toward.multiplyScalar(Math.cos(0.5)).add(along.multiplyScalar(Math.sin(0.5))).normalize();
    dir.y = 0.8;
    dir.normalize();
    this.camera.position.copy(TARGET).addScaledVector(dir, 3);
    this.camera.zoom = 1;
    this.camera.up.set(0, 1, 0);
    this.controls.target.copy(TARGET);
    this.updateCamera();
    this.controls.update();
    this.requestRender();
  }

  private refreshTexture(texture: CanvasTexture): void {
    const img = texture.image as HTMLCanvasElement;
    const last = texture.userData as { w?: number; h?: number };
    // A texture keeps its GPU storage size; a resized canvas needs a fresh upload.
    if (last.w !== img.width || last.h !== img.height) {
      texture.dispose();
      texture.userData = { w: img.width, h: img.height };
    }
    texture.needsUpdate = true;
    this.requestRender();
  }

  private updateCamera(): void {
    const aspect = this.width / this.height;
    const halfH = VIEW_HEIGHT / 2;
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  private sync(state: AppState, changed: Set<keyof AppState>): void {
    const any = (...keys: (keyof AppState)[]) => keys.some((k) => changed.has(k));
    if (changed.has('paints')) {
      this.placeDots(state.paints);
      this.buildHull(state.paints);
    }
    if (any('L', 'h', 'cut')) this.updateCut(state);
    if (any('gamut', 'gamutStyle', 'hull', 'hullStyle', 'paints')) {
      // The caps and their outlines still follow the cut mode, so a cut shows its slice inside a cage.
      for (const gamut of ['srgb', 'pointer'] as const) {
        const shown = state.gamut === gamut;
        this.spaces[gamut].solid.visible = shown && state.gamutStyle === 'solid';
        this.spaces[gamut].cage.visible = shown && state.gamutStyle === 'wireframe';
      }
      const hull = state.hull && this.hull !== null;
      this.hullSolid.visible = hull && state.hullStyle === 'solid';
      this.hullWire.visible = hull && state.hullStyle === 'wireframe';
    }
    if (any('L', 'h', 'cut', 'gamut', 'hull', 'paints')) this.updateOutlines(state);
    if (any('gamut', 'hull', 'paints')) this.updateStat(state);
    if (changed.has('pick')) this.placeMarker(this.pickMarker, state.pick);
    if (changed.has('hover')) {
      this.hoverMarker.group.visible = state.hover !== null;
      if (state.hover) this.placeMarker(this.hoverMarker, state.hover);
    }
    this.requestRender();
  }

  private updateCut(state: AppState): void {
    const rad = (state.h * Math.PI) / 180;
    // Normal of the hue plane that points to hue h - 90°. The camera looks from this side.
    const n = new Vector3(Math.sin(rad), 0, Math.cos(rad));

    this.keepBelowL.constant = state.L;
    this.keepAboveL.constant = -state.L;
    this.keepFarFromCamera.normal.copy(n).negate();
    this.keepNearCamera.normal.copy(n);

    this.lightnessCap.position.y = state.L;
    this.hueCap.rotation.set(0, rad, 0);

    const cut: CutMode = state.cut;
    const solids = [this.spaces.srgb.solid.material, this.spaces.pointer.solid.material, this.hullSolid.material];
    const planes =
      cut === 'lightness'
        ? [this.keepBelowL]
        : cut === 'hue'
          ? [this.keepFarFromCamera]
          : cut === 'wedge'
            ? [this.keepBelowL, this.keepFarFromCamera]
            : [];
    for (const m of solids) {
      m.clipIntersection = cut === 'wedge';
      m.clippingPlanes = planes;
    }
    // In the wedge only the parts of each slice that face the removed quarter are visible.
    const lPlanes = cut === 'wedge' ? [this.keepNearCamera] : [];
    const hPlanes = cut === 'wedge' ? [this.keepAboveL] : [];
    const lcap = this.lightnessCap.material;
    const hcap = this.hueCap.material;
    const lhull = this.hullLightnessOutline.material;
    const hhull = this.hullHueOutline.material;
    lcap.clippingPlanes = lhull.clippingPlanes = lPlanes;
    hcap.clippingPlanes = hhull.clippingPlanes = hPlanes;
    this.lightnessCap.visible = cut === 'lightness' || cut === 'wedge';
    this.hueCap.visible = cut === 'hue' || cut === 'wedge';
    for (const m of [...solids, lcap, hcap, lhull, hhull]) m.needsUpdate = true;
  }

  /**
   * Unlit rendering keeps every color exact but gives the solid no shading, so the cut faces
   * get an outline instead. The outline traces the color space's boundary within each cut plane, and a
   * dashed one the paint hull's.
   */
  private updateOutlines(state: AppState): void {
    const { L, h, cut } = state;
    const cmax = MAX_CHROMA[state.gamut];
    const at = (l: number, hue: number) => labToScene(oklchToOklab([l, cmax(l, hue), hue]));

    const lPts: Vector3[] = [];
    if (cut === 'lightness' || cut === 'wedge') {
      // In the wedge only the half facing the camera (hues h+180° .. h-90° .. h) is exposed.
      const [from, to] = cut === 'wedge' ? [h + 180, h + 360] : [0, 360];
      for (let t = from; t <= to + 1e-9; t += 1) lPts.push(at(L, t));
      if (cut === 'wedge') lPts.push(lPts[0].clone()); // straight edge where the two cuts meet
    }

    const hPts: Vector3[] = [];
    if (cut === 'hue' || cut === 'wedge') {
      const bottom = cut === 'wedge' ? L : 0;
      const steps = 240;
      for (let i = 0; i <= steps; i++) hPts.push(at(bottom + ((1 - bottom) * i) / steps, h));
      for (let i = steps; i >= 0; i--) hPts.push(at(bottom + ((1 - bottom) * i) / steps, h + 180));
      hPts.push(hPts[0].clone());
    }

    for (const [line, pts] of [
      [this.lightnessOutline, lPts],
      [this.hueOutline, hPts],
    ] as const) {
      line.geometry.dispose();
      line.geometry = new BufferGeometry().setFromPoints(pts);
      line.visible = pts.length > 1;
    }
    // Dark lines on light faces, light lines on dark ones.
    const lColor = L > 0.5 ? 0x111111 : 0xf0f0f0;
    const hColor = cut === 'wedge' ? 0x111111 : 0x7a7a7a;
    this.lightnessOutline.material.color.set(lColor);
    this.hueOutline.material.color.set(hColor);

    const hull = state.hull && this.hull !== null;
    const rad = (h * Math.PI) / 180;
    const lightnessPlane = new Plane(new Vector3(0, 1, 0), -L);
    const huePlane = new Plane(new Vector3(Math.sin(rad), 0, Math.cos(rad)), 0);
    for (const [outline, show, plane, color] of [
      [this.hullLightnessOutline, cut === 'lightness' || cut === 'wedge', lightnessPlane, lColor],
      [this.hullHueOutline, cut === 'hue' || cut === 'wedge', huePlane, hColor],
    ] as const) {
      const pts = hull && show ? planeSection(this.hullFaces.geometry, plane) : [];
      outline.geometry.dispose();
      outline.geometry = new BufferGeometry().setFromPoints(pts);
      outline.computeLineDistances();
      outline.material.color.set(color);
      outline.visible = pts.length > 0;
    }
  }

  private buildHull(paints: readonly Paint[]): void {
    const points = paints.map((p) => p.lab);
    const hull = paints.length >= MIN_HULL_PAINTS ? convexHull(points) : null;
    this.hull = hull;
    for (const [object, build] of [
      [this.hullSolid, buildHullGeometry],
      [this.hullWire, buildHullWireGeometry],
      [this.hullFaces, hullFaceGeometry],
    ] as const) {
      object.geometry.dispose();
      object.geometry = hull ? build(points, hull) : new BufferGeometry();
    }
  }

  private updateStat(state: AppState): void {
    const pct = (share: number) => `${Math.round(share * 100)}%`;
    const pointer = state.gamut === 'pointer';
    const parts: string[] = [];
    if (state.hull) {
      const n = state.paints.length;
      if (n < MIN_HULL_PAINTS) parts.push(`Show at least ${MIN_HULL_PAINTS} paints to draw their hull.`);
      else if (!this.hull) parts.push('The shown paints lie in one plane, so their hull has no volume.');
      else {
        const share = pct(hullCoverage(state.gamut, this.hull));
        const space = pointer ? "Pointer's gamut" : 'the sRGB gamut';
        parts.push(`The hull of the ${n} shown paints covers ${share} of ${space}.`);
      }
    }
    if (pointer) parts.push(`sRGB covers ${pct(srgbShareOfPointer())} of Pointer's gamut.`);
    if (parts.length > 0) parts.push('Shares are of the volume in OKLab.');
    this.stat.textContent = parts.join(' ');
  }

  private placeMarker(marker: ReturnType<typeof makeMarker>, lab: Vec3): void {
    marker.group.position.copy(labToScene(lab));
    const rgb = oklabToDisplayLinear(lab);
    marker.fill.color.setRGB(rgb[0], rgb[1], rgb[2]); // linear working space
    marker.rim.color.set(lab[0] > 0.62 ? 0x000000 : 0xffffff);
  }

  private placeDots(paints: readonly Paint[]): void {
    this.paints = paints;
    const positions = new Float32Array(paints.length * 3);
    const fills = new Float32Array(paints.length * 3);
    const rims = new Float32Array(paints.length * 3);
    paints.forEach((paint, i) => {
      positions.set(labToScene(paint.lab).toArray(), i * 3);
      // Vertex colors are linear-light, like the solid's.
      fills.set(oklabToDisplayLinear(paint.lab), i * 3);
      rims.set(new Color(paint.lab[0] > 0.62 ? 0x000000 : 0xffffff).toArray(), i * 3);
    });
    for (const [dots, colors] of [
      [this.dotRims, rims],
      [this.dotFills, fills],
    ] as const) {
      dots.geometry.dispose();
      dots.geometry = new BufferGeometry();
      dots.geometry.setAttribute('position', new BufferAttribute(positions, 3));
      dots.geometry.setAttribute('color', new BufferAttribute(colors, 3));
    }
  }

  /** The front-most paint dot under the pointer. Dots are drawn over the solid, so they win over it. */
  private paintAtPointer(e: PointerEvent): Paint | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const p = new Vector3();
    let best: Paint | null = null;
    let bestDepth = Infinity;
    for (const paint of this.paints) {
      p.copy(labToScene(paint.lab)).project(this.camera);
      const x = ((p.x + 1) / 2) * rect.width;
      const y = ((1 - p.y) / 2) * rect.height;
      if (Math.hypot(x - px, y - py) <= DOT_HIT && p.z < bestDepth) {
        best = paint;
        bestDepth = p.z;
      }
    }
    return best;
  }

  private labAtPointer(e: PointerEvent): Vec3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const srgb = this.spaces.srgb.solid;
    const targets = [srgb, this.spaces.pointer.solid, this.lightnessCap, this.hueCap].filter((o) => o.visible);
    if (this.hullSolid.visible) targets.push(this.hullFaces);
    for (const hit of this.raycaster.intersectObjects(targets, false)) {
      const material = (hit.object as Mesh).material as Material;
      if (clippedBy(hit.point, material)) continue;
      if (hit.object === srgb && hit.face && hit.barycoord) {
        // The flat triangles sit a hair off the curved surface, so take the color from the
        // interpolated vertex colors instead of the hit position. That color is always in gamut.
        const color = srgb.geometry.getAttribute('color') as BufferAttribute;
        const { a, b, c } = hit.face;
        const w = hit.barycoord;
        const rgb: Vec3 = [0, 1, 2].map(
          (k) => w.x * color.getComponent(a, k) + w.y * color.getComponent(b, k) + w.z * color.getComponent(c, k),
        ) as Vec3;
        return linearSrgbToOklab(rgb);
      }
      const lab = sceneToLab(hit.point);
      // The caps are transparent outside the gamut. Pointer's gamut and the hull are not.
      const isCap = hit.object === this.lightnessCap || hit.object === this.hueCap;
      if (isCap && !isOklabInGamut(lab)) continue;
      return lab;
    }
    return null;
  }

  private requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.clearDepth();
      this.renderer.render(this.overlay, this.camera);
    });
  }
}
