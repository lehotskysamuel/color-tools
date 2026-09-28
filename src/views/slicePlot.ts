import {
  type Vec3,
  encodeLinear8,
  GAMUT_EPSILON,
  oklabToDisplayLinearInto,
  oklabToLinearSrgbInto,
} from '../color/oklab';
import type { Paint } from '../paints/vallejo';
import { type AppState, type Store, pickPaint } from '../state';
import { type Theme, readTheme } from '../theme';

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The part of the slice plane that is drawn, in plane coordinates (OKLab units, y pointing up). */
export interface WorldRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * A planar slice through OKLab: lab = origin + x·ex + y·ey, with ex and ey orthonormal.
 * Because the basis is orthonormal and both axes share one pixel scale, on-screen distance
 * inside the slice is exactly proportional to ΔE_OK.
 */
export interface SliceBasis {
  origin: Vec3;
  ex: Vec3;
  ey: Vec3;
}

/** `paint` is set when the pointer is over a paint's dot rather than the space itself. */
export type HoverHandler = (lab: Vec3 | null, clientX: number, clientY: number, paint?: Paint) => void;

/** Tolerance for "this color lies on the slice plane", in OKLab units. */
const ON_PLANE = 1e-7;
/** Paints within this ΔE_OK of the slice plane are drawn on it, fainter the farther they are. */
export const PAINT_BAND = 0.04;
/** Radius of a paint dot including its rim, and how close the pointer must be to hit one, in CSS pixels. */
const PAINT_RADIUS = 4.5;
const PAINT_HIT = 7;

const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p: Vec3, q: Vec3): Vec3 => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];

export abstract class SlicePlot {
  /** On-screen canvas: slice image plus axes, labels and markers. */
  readonly canvas: HTMLCanvasElement;
  /** Offscreen canvas holding only the slice pixels (transparent outside sRGB). Reused as a 3D texture. */
  readonly image: HTMLCanvasElement;
  /** Called after the slice pixels are re-rendered. */
  onImageChange: (() => void) | null = null;
  onHover: HoverHandler | null = null;

  protected scale = 300; // CSS pixels per OKLab unit
  protected theme: Theme;
  protected readonly ctx: CanvasRenderingContext2D;
  private readonly imageCtx: CanvasRenderingContext2D;
  private dpr = 1;
  private hatch: CanvasPattern | null = null;
  private frame = 0;
  private imageDirty = true;
  private sizedAt = '';
  /** Where the paint dots were last drawn, nearest the plane last, for hit testing. */
  private paintDots: { paint: Paint; x: number; y: number }[] = [];

  constructor(
    protected readonly store: Store,
    protected readonly world: WorldRect,
    protected readonly margins: Margins,
    /** State keys whose change requires re-rendering the slice pixels. */
    private readonly imageKeys: (keyof AppState)[],
    ariaLabel: string,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'slice-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', ariaLabel);
    this.ctx = this.canvas.getContext('2d')!;
    this.image = document.createElement('canvas');
    this.imageCtx = this.image.getContext('2d', { willReadFrequently: false })!;
    this.theme = readTheme();

    store.subscribe((_state, changed) => {
      const image = this.imageKeys.some((k) => changed.has(k));
      this.invalidate(image);
    });

    this.canvas.addEventListener('pointermove', (e) => this.handlePointer(e));
    this.canvas.addEventListener('pointerleave', () => this.onHover?.(null, 0, 0));
    this.canvas.addEventListener('click', (e) => {
      const paint = this.paintAtEvent(e);
      if (paint) {
        pickPaint(this.store, paint);
        return;
      }
      const lab = this.labAtEvent(e);
      if (lab && this.inGamut(lab)) this.pick(lab);
    });
  }

  /** Plane of this slice for the given state. */
  protected abstract basis(state: AppState): SliceBasis;
  /** Axes, grid, labels. Drawn over the slice image, under the markers. */
  protected abstract drawOverlay(ctx: CanvasRenderingContext2D, state: AppState, theme: Theme): void;
  /** Called when the user clicks an in-gamut color in this view. */
  protected abstract pick(lab: Vec3): void;

  get plotWidth(): number {
    return (this.world.x1 - this.world.x0) * this.scale;
  }

  get plotHeight(): number {
    return (this.world.y1 - this.world.y0) * this.scale;
  }

  /** CSS size of the whole canvas (plot plus margins) at a given scale. */
  sizeAt(scale: number): { width: number; height: number } {
    const m = this.margins;
    return {
      width: (this.world.x1 - this.world.x0) * scale + m.left + m.right,
      height: (this.world.y1 - this.world.y0) * scale + m.top + m.bottom,
    };
  }

  setScale(scale: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${scale}@${dpr}`;
    if (key === this.sizedAt) return;
    this.sizedAt = key;
    this.scale = scale;
    this.dpr = dpr;
    const { width, height } = this.sizeAt(scale);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.invalidate(true);
  }

  refreshTheme(): void {
    this.theme = readTheme();
    this.hatch = null;
    this.invalidate();
  }

  invalidate(image = false): void {
    if (image) this.imageDirty = true;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** Plane coordinates -> CSS pixel position on the canvas. */
  protected toPx(x: number, y: number): [number, number] {
    return [this.margins.left + (x - this.world.x0) * this.scale, this.margins.top + (this.world.y1 - y) * this.scale];
  }

  protected fromPx(px: number, py: number): [number, number] {
    return [this.world.x0 + (px - this.margins.left) / this.scale, this.world.y1 - (py - this.margins.top) / this.scale];
  }

  protected labAt(x: number, y: number, state = this.store.get()): Vec3 {
    const { origin: o, ex, ey } = this.basis(state);
    return [o[0] + x * ex[0] + y * ey[0], o[1] + x * ex[1] + y * ey[1], o[2] + x * ex[2] + y * ey[2]];
  }

  /** Plane coordinates of an OKLab color, or null when it is not on this slice. */
  protected planeCoords(lab: Vec3, state = this.store.get()): [number, number] | null {
    const { origin, ex, ey } = this.basis(state);
    const rel: Vec3 = [lab[0] - origin[0], lab[1] - origin[1], lab[2] - origin[2]];
    if (Math.abs(dot(rel, cross(ex, ey))) > ON_PLANE) return null;
    const x = dot(rel, ex);
    const y = dot(rel, ey);
    const w = this.world;
    if (x < w.x0 || x > w.x1 || y < w.y0 || y > w.y1) return null;
    return [x, y];
  }

  protected inGamut(lab: Vec3): boolean {
    const rgb: Vec3 = [0, 0, 0];
    oklabToLinearSrgbInto(lab[0], lab[1], lab[2], rgb);
    const e = GAMUT_EPSILON;
    return rgb.every((c) => c >= -e && c <= 1 + e);
  }

  private labAtEvent(e: MouseEvent): Vec3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const [x, y] = this.fromPx(e.clientX - rect.left, e.clientY - rect.top);
    const w = this.world;
    if (x < w.x0 || x > w.x1 || y < w.y0 || y > w.y1) return null;
    return this.labAt(x, y);
  }

  private paintAtEvent(e: MouseEvent): Paint | null {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best: Paint | null = null;
    let bestDist = PAINT_HIT;
    // Later dots are drawn on top, so they win ties.
    for (const dot of this.paintDots) {
      const dist = Math.hypot(dot.x - px, dot.y - py);
      if (dist <= bestDist) {
        best = dot.paint;
        bestDist = dist;
      }
    }
    return best;
  }

  private handlePointer(e: PointerEvent): void {
    const paint = this.paintAtEvent(e);
    if (paint) this.onHover?.(paint.lab, e.clientX, e.clientY, paint);
    else this.onHover?.(this.labAtEvent(e), e.clientX, e.clientY);
  }

  private renderImage(): void {
    const w = Math.max(1, Math.round(this.plotWidth * this.dpr));
    const h = Math.max(1, Math.round(this.plotHeight * this.dpr));
    if (this.image.width !== w || this.image.height !== h) {
      this.image.width = w;
      this.image.height = h;
    }
    const img = this.imageCtx.createImageData(w, h);
    const data = img.data;
    const { origin: o, ex, ey } = this.basis(this.store.get());
    const { x0, x1, y0, y1 } = this.world;
    const dx = (x1 - x0) / w;
    const dy = (y1 - y0) / h;
    const rgb: Vec3 = [0, 0, 0];
    const lo = -GAMUT_EPSILON;
    const hi = 1 + GAMUT_EPSILON;
    let p = 0;
    for (let j = 0; j < h; j++) {
      const y = y1 - (j + 0.5) * dy;
      const rowL = o[0] + y * ey[0];
      const rowA = o[1] + y * ey[1];
      const rowB = o[2] + y * ey[2];
      for (let i = 0; i < w; i++, p += 4) {
        const x = x0 + (i + 0.5) * dx;
        oklabToLinearSrgbInto(rowL + x * ex[0], rowA + x * ex[1], rowB + x * ex[2], rgb);
        const r = rgb[0];
        const g = rgb[1];
        const b = rgb[2];
        if (r < lo || r > hi || g < lo || g > hi || b < lo || b > hi) {
          data[p + 3] = 0;
          continue;
        }
        data[p] = encodeLinear8(r);
        data[p + 1] = encodeLinear8(g);
        data[p + 2] = encodeLinear8(b);
        data[p + 3] = 255;
      }
    }
    this.imageCtx.putImageData(img, 0, 0);
    this.imageDirty = false;
    this.onImageChange?.();
  }

  private hatchPattern(): CanvasPattern | null {
    if (this.hatch) return this.hatch;
    const tile = document.createElement('canvas');
    tile.width = tile.height = 8;
    const t = tile.getContext('2d')!;
    t.fillStyle = this.theme.surface;
    t.fillRect(0, 0, 8, 8);
    t.strokeStyle = this.theme.hatch;
    t.lineWidth = 1;
    t.beginPath();
    t.moveTo(-2, 10);
    t.lineTo(10, -2);
    t.moveTo(-2, 2);
    t.lineTo(2, -2);
    t.moveTo(6, 10);
    t.lineTo(10, 6);
    t.stroke();
    this.hatch = this.ctx.createPattern(tile, 'repeat');
    return this.hatch;
  }

  private draw(): void {
    if (this.imageDirty) this.renderImage();
    const ctx = this.ctx;
    const state = this.store.get();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const m = this.margins;
    ctx.fillStyle = this.hatchPattern() ?? this.theme.surface;
    ctx.fillRect(m.left, m.top, this.plotWidth, this.plotHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.image, m.left, m.top, this.plotWidth, this.plotHeight);

    this.drawOverlay(ctx, state, this.theme);
    this.drawPaints(state);

    if (state.hover) this.drawHover(state.hover, state);
    this.drawPick(state.pick, state);
  }

  /**
   * Paints near the plane, at their orthogonal projection onto it. Opacity falls with distance
   * from the plane, and the nearest are drawn last so they stay on top.
   */
  private drawPaints(state: AppState): void {
    const { origin, ex, ey } = this.basis(state);
    const n = cross(ex, ey);
    const w = this.world;
    const near: { paint: Paint; x: number; y: number; d: number }[] = [];
    for (const paint of state.paints) {
      const lab = paint.lab;
      const rel: Vec3 = [lab[0] - origin[0], lab[1] - origin[1], lab[2] - origin[2]];
      const d = Math.abs(dot(rel, n));
      if (d > PAINT_BAND) continue;
      const x = dot(rel, ex);
      const y = dot(rel, ey);
      if (x < w.x0 || x > w.x1 || y < w.y0 || y > w.y1) continue;
      const [px, py] = this.toPx(x, y);
      near.push({ paint, x: px, y: py, d });
    }
    near.sort((p, q) => q.d - p.d);

    const ctx = this.ctx;
    for (const { paint, x, y, d } of near) {
      ctx.globalAlpha = 1 - (0.8 * d) / PAINT_BAND;
      ctx.beginPath();
      ctx.arc(x, y, PAINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = paint.lab[0] > 0.62 ? '#000' : '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, PAINT_RADIUS - 1.25, 0, Math.PI * 2);
      ctx.fillStyle = paint.display;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.paintDots = near;
  }

  private drawPick(lab: Vec3, state: AppState): void {
    const at = this.planeCoords(lab, state);
    if (!at) return;
    const [px, py] = this.toPx(at[0], at[1]);
    const ctx = this.ctx;
    const dark = lab[0] > 0.62;
    const rgb = oklabToDisplayLinearInto(lab[0], lab[1], lab[2], [0, 0, 0]);
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${rgb.map(encodeLinear8).join(',')})`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = dark ? '#000' : '#fff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 8.5, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';
    ctx.stroke();
  }

  private drawHover(lab: Vec3, state: AppState): void {
    const at = this.planeCoords(lab, state);
    if (!at) return;
    const [px, py] = this.toPx(at[0], at[1]);
    const ctx = this.ctx;
    const dark = lab[0] > 0.62;
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = dark ? '#000' : '#fff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 11.5, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';
    ctx.stroke();
  }

  /** Text with a halo in the surface color so it stays legible over the colored slice. */
  protected label(
    text: string,
    x: number,
    y: number,
    align: CanvasTextAlign,
    baseline: CanvasTextBaseline,
    color = this.theme.ink2,
    halo = false,
  ): void {
    const ctx = this.ctx;
    ctx.font = `11px ${this.theme.monoFont}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (halo) {
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.theme.surface;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  protected line(x0: number, y0: number, x1: number, y1: number, color: string, width = 1, dash: number[] = []): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
