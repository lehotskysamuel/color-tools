import { type Vec3, formatOklch, isOklabInGamut, oklabToHex, oklabToOklch } from '../color/oklab';
import { type Paint, paintLabel } from '../paints/vallejo';

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
