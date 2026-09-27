import { AB_RANGE, type Vec3, maxChroma, oklabToOklch } from '../color/oklab';
import type { AppState, Store } from '../state';
import type { Theme } from '../theme';
import { type SliceBasis, SlicePlot } from './slicePlot';

const R = AB_RANGE;
const RINGS = [0.1, 0.2, 0.3];

/**
 * View B.1: a horizontal cut through OKLab at one lightness.
 * x is a (green -> red), y is b (blue -> yellow); hue is the angle, chroma the radius.
 */
export class LightnessSlice extends SlicePlot {
  constructor(
    store: Store,
    private readonly statEl: HTMLElement | null,
  ) {
    super(
      store,
      { x0: -R, x1: R, y0: -R, y1: R },
      { top: 22, right: 34, bottom: 22, left: 34 },
      ['L'],
      'Horizontal slice of OKLab at the selected lightness. Hue is the angle around the center, chroma the distance from it.',
    );
    store.subscribe((state, changed) => {
      if (changed.has('L')) this.updateStat(state);
    });
    this.updateStat(store.get());
  }

  protected basis(state: AppState): SliceBasis {
    return { origin: [state.L, 0, 0], ex: [0, 1, 0], ey: [0, 0, 1] };
  }

  protected pick(lab: Vec3): void {
    const [, C, h] = oklabToOklch(lab);
    // A neutral has no hue; keep the hue slice where it is.
    this.store.set({ pick: lab, pickPaint: null, h: C > 1e-4 ? h : this.store.get().h });
  }

  protected drawOverlay(ctx: CanvasRenderingContext2D, state: AppState, theme: Theme): void {
    const [cx, cy] = this.toPx(0, 0);
    const s = this.scale;
    const m = this.margins;
    const left = m.left;
    const top = m.top;
    const right = m.left + this.plotWidth;
    const bottom = m.top + this.plotHeight;

    // Neutral axis crosshair and chroma rings.
    this.line(left, cy, right, cy, theme.line);
    this.line(cx, top, cx, bottom, theme.line);
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.line;
    for (const c of RINGS) {
      ctx.beginPath();
      ctx.arc(cx, cy, c * s, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hue ticks every 30° on the rim.
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg * Math.PI) / 180;
      const x0 = cx + Math.cos(rad) * (R - 0.012) * s;
      const y0 = cy - Math.sin(rad) * (R - 0.012) * s;
      const x1 = cx + Math.cos(rad) * R * s;
      const y1 = cy - Math.sin(rad) * R * s;
      this.line(x0, y0, x1, y1, theme.ink3);
    }
    this.label('0°', right + 6, cy, 'left', 'middle', theme.ink2);
    this.label('90°', cx, top - 6, 'center', 'bottom', theme.ink2);
    this.label('180°', left - 6, cy, 'right', 'middle', theme.ink2);
    this.label('270°', cx, bottom + 6, 'center', 'top', theme.ink2);

    // Chroma ring labels toward 225°, where sRGB has little chroma and the labels mostly sit on the hatch.
    const diag = Math.SQRT1_2;
    for (const c of RINGS) {
      this.label(c.toFixed(1), cx - c * s * diag - 2, cy + c * s * diag + 2, 'right', 'top', theme.ink2, true);
    }

    // Where the hue slice (B.2) cuts this plane: a line through the center at h and h + 180°.
    const rad = (state.h * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = -Math.sin(rad);
    const reach = R * s;
    this.line(cx - ux * reach, cy - uy * reach, cx + ux * reach, cy + uy * reach, theme.ink, 1.25, [5, 4]);
    const tag = `B.2 · ${state.h.toFixed(0)}°`;
    const tx = cx + ux * (R - 0.05) * s;
    const ty = cy + uy * (R - 0.05) * s;
    this.label(tag, tx, ty - 8, 'center', 'bottom', theme.ink, true);
  }

  private updateStat(state: AppState): void {
    if (!this.statEl) return;
    let best = { h: 0, C: 0 };
    for (let h = 0; h < 360; h += 1) {
      const C = maxChroma(state.L, h);
      if (C > best.C) best = { h, C };
    }
    this.statEl.textContent =
      best.C < 0.001
        ? `L ${state.L.toFixed(3)}: only the neutral gray exists at this lightness.`
        : `L ${state.L.toFixed(3)}: the most chromatic sRGB color here has hue ${best.h}° and C ${best.C.toFixed(3)}.`;
  }
}
