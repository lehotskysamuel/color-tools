import { JND, type Vec3, deltaEOK, formatOklch, isOklabInGamut, oklabToHex, oklabToOklch } from '../color/oklab';
import { type Paint, paintLabel } from '../paints/vallejo';
import type { Store } from '../state';
import type { HoverHandler } from './slicePlot';

export interface TooltipElements {
  root: HTMLElement;
  name: HTMLElement;
  swatch: HTMLElement;
  main: HTMLElement;
  sub: HTMLElement;
}

/** The hover tooltip: a color's OKLCh and hex, and the paint's name when the color is a paint. */
export class Tooltip {
  constructor(private readonly els: TooltipElements) {}

  /** `note` is appended to the hex line; colors outside sRGB, which are never paints, show no hex and no note. */
  show(lab: Vec3, clientX: number, clientY: number, paint?: Paint, note?: string): void {
    const { root, name, swatch, main, sub } = this.els;
    name.textContent = paint ? paintLabel(paint) : '';
    name.hidden = !paint;
    const inGamut = isOklabInGamut(lab);
    main.textContent = formatOklch(oklabToOklch(lab));
    if (inGamut) {
      // A paint's color is its web hex, so it is always in sRGB.
      const hex = paint ? paint.webhex : oklabToHex(lab);
      swatch.style.background = hex;
      swatch.style.visibility = 'visible';
      sub.textContent = `${hex}${note ? ` · ${note}` : ''}`;
    } else {
      swatch.style.visibility = 'hidden';
      sub.textContent = 'Outside sRGB. No screen color here.';
    }
    root.hidden = false;
    const pad = 14;
    const { width, height } = root.getBoundingClientRect();
    const x = clientX + pad + width > window.innerWidth ? clientX - pad - width : clientX + pad;
    const y = clientY + pad + height > window.innerHeight ? clientY - pad - height : clientY + pad;
    root.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }

  hide(): void {
    this.els.root.hidden = true;
  }
}

/** Builds the tooltip's elements at the end of the page. */
export function createTooltip(): Tooltip {
  const div = (className: string) => {
    const el = document.createElement('div');
    el.className = className;
    return el;
  };
  const root = div('tooltip');
  root.setAttribute('role', 'status');
  root.hidden = true;
  const swatch = div('tooltip-swatch');
  const name = div('tooltip-name');
  const main = div('mono');
  const sub = div('mono tooltip-sub');
  const text = div('tooltip-text');
  text.append(name, main, sub);
  root.append(swatch, text);
  document.body.append(root);
  return new Tooltip({ root, name, swatch, main, sub });
}

/**
 * The hover handler of the views and the paint swatches: writes the hovered color to the store and shows it in the
 * tooltip with its ΔE_OK from the picked color.
 */
export function pickHoverHandler(store: Store, tooltip: Tooltip): HoverHandler {
  return (lab, clientX, clientY, paint) => {
    store.set({ hover: lab });
    if (!lab) {
      tooltip.hide();
      return;
    }
    const dE = deltaEOK(lab, store.get().pick);
    tooltip.show(lab, clientX, clientY, paint, `ΔE ${dE.toFixed(3)} from picked (≈ ${(dE / JND).toFixed(1)} JND)`);
  };
}
