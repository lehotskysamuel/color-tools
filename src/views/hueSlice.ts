import { AB_RANGE, type Vec3, findCusp } from '../color/oklab';
import type { AppState, Store } from '../state';
import type { Theme } from '../theme';
import { type SliceBasis, SlicePlot } from './slicePlot';

const R = AB_RANGE;
const L_TICKS = [0, 0.25, 0.5, 0.75, 1];
const C_TICKS = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];

const wrap = (h: number) => ((h % 360) + 360) % 360;

/**
 * View B.2: a vertical cut through OKLab along the gray axis.
 * Right half is hue h, left half its complement h + 180°. y is lightness, |x| is chroma.
 * Because it is a true plane, distances across the gray axis are perceptual too.
 */
export class HueSlice extends SlicePlot {
  private cusps = { main: { L: 0, C: 0 }, complement: { L: 0, C: 0 } };

  constructor(
    store: Store,
    private readonly statEl: HTMLElement | null,
  ) {
    super(
      store,
      { x0: -R, x1: R, y0: 0, y1: 1 },
      { top: 24, right: 12, bottom: 24, left: 38 },
      ['h'],
      'Vertical slice of OKLab through the gray axis. Lightness runs up, chroma outward; the selected hue is on the right and its complement on the left.',
    );
    store.subscribe((state, changed) => {
      if (changed.has('h')) this.updateCusps(state);
    });
    this.updateCusps(store.get());
  }

  protected basis(state: AppState): SliceBasis {
    const rad = (state.h * Math.PI) / 180;
    return { origin: [0, 0, 0], ex: [0, Math.cos(rad), Math.sin(rad)], ey: [1, 0, 0] };
  }

  protected pick(lab: Vec3): void {
    this.store.set({ pick: lab, pickPaint: null, L: lab[0] });
  }

  protected drawOverlay(ctx: CanvasRenderingContext2D, state: AppState, theme: Theme): void {
    const m = this.margins;
    const left = m.left;
    const top = m.top;
    const right = m.left + this.plotWidth;
    const bottom = m.top + this.plotHeight;

    for (const L of L_TICKS) {
      const [, y] = this.toPx(0, L);
      if (L > 0 && L < 1) this.line(left, y, right, y, theme.line);
      this.label(L === 0 || L === 1 ? L.toFixed(0) : String(L), left - 6, y, 'right', 'middle', theme.ink2);
    }
    for (const c of C_TICKS) {
      const [x] = this.toPx(c, 0);
      this.line(x, top, x, bottom, c === 0 ? theme.ink3 : theme.line);
      this.label(Math.abs(c).toFixed(1).replace(/^0\.0$/, '0'), x, bottom + 6, 'center', 'top', theme.ink2);
    }
    this.label('L', left - 6, top - 8, 'right', 'bottom', theme.ink3);

    this.label(`← h ${wrap(state.h + 180).toFixed(0)}°`, left, top - 6, 'left', 'bottom', theme.ink2);
    this.label(`h ${wrap(state.h).toFixed(0)}° →`, right, top - 6, 'right', 'bottom', theme.ink);

    // Cusps: where each half-plane reaches its highest chroma.
    const cuspMark = (C: number, L: number) => {
      const [x, y] = this.toPx(C, L);
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = theme.surface;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - 3.5);
      ctx.lineTo(x + 3.5, y);
      ctx.lineTo(x, y + 3.5);
      ctx.lineTo(x - 3.5, y);
      ctx.closePath();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = theme.ink;
      ctx.stroke();
    };
    cuspMark(this.cusps.main.C, this.cusps.main.L);
    cuspMark(-this.cusps.complement.C, this.cusps.complement.L);

    // Where the lightness slice (B.1) cuts this plane.
    const [, ly] = this.toPx(0, state.L);
    this.line(left, ly, right, ly, theme.ink, 1.25, [5, 4]);
    this.label(`B.1 · L ${state.L.toFixed(2)}`, left + 4, ly - 5, 'left', 'bottom', theme.ink, true);
  }

  private updateCusps(state: AppState): void {
    this.cusps = { main: findCusp(wrap(state.h)), complement: findCusp(wrap(state.h + 180)) };
    if (!this.statEl) return;
    const { main, complement } = this.cusps;
    this.statEl.textContent =
      `Cusps (◇): hue ${wrap(state.h).toFixed(0)}° peaks at L ${main.L.toFixed(2)}, C ${main.C.toFixed(3)}; ` +
      `hue ${wrap(state.h + 180).toFixed(0)}° peaks at L ${complement.L.toFixed(2)}, C ${complement.C.toFixed(3)}.`;
  }
}
