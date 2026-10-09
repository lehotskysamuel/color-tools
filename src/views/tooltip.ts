import {
  JND,
  type Vec3,
  deltaEOK,
  formatOklch,
  isOklabInGamut,
  oklabToHex,
  oklabToOklch,
} from '../color/oklab';
import { type Paint, paintLabel } from '../paints/vallejo';
import type { Store } from '../state';
import type { HoverHandler } from './slicePlot';

/**
 * The hover tooltip shared by the views and the paint swatches: the color's OKLCh, hex and ΔE_OK from the picked
 * color. Builds its element and returns the handler the views call; it also writes the hovered color to the store.
 */
export function hoverTooltip(store: Store): HoverHandler {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.setAttribute('role', 'status');
  tooltip.hidden = true;
  const tipSwatch = div('tooltip-swatch');
  const tipName = div('tooltip-name');
  const tipMain = div('mono');
  const tipSub = div('mono tooltip-sub');
  const text = div('tooltip-text');
  text.append(tipName, tipMain, tipSub);
  tooltip.append(tipSwatch, text);
  document.body.append(tooltip);

  return (lab: Vec3 | null, clientX: number, clientY: number, paint?: Paint) => {
    store.set({ hover: lab });
    if (!lab) {
      tooltip.hidden = true;
      return;
    }
    tipName.textContent = paint ? paintLabel(paint) : '';
    tipName.hidden = !paint;
    const inGamut = isOklabInGamut(lab);
    tipMain.textContent = formatOklch(oklabToOklch(lab));
    const dE = deltaEOK(lab, store.get().pick);
    const fromPick = `ΔE ${dE.toFixed(3)} from picked (≈ ${(dE / JND).toFixed(1)} JND)`;
    if (inGamut || paint) {
      // A paint outside sRGB still exists; show it as its nearest screen color.
      const hex = paint ? paint.display : oklabToHex(lab);
      tipSwatch.style.background = hex;
      tipSwatch.style.visibility = 'visible';
      tipSub.textContent = `${inGamut ? hex : `outside sRGB, shown as ${hex}`} · ${fromPick}`;
    } else {
      tipSwatch.style.visibility = 'hidden';
      tipSub.textContent = 'Outside sRGB. No screen color here.';
    }
    tooltip.hidden = false;
    const pad = 14;
    const { width, height } = tooltip.getBoundingClientRect();
    const x = clientX + pad + width > window.innerWidth ? clientX - pad - width : clientX + pad;
    const y = clientY + pad + height > window.innerHeight ? clientY - pad - height : clientY + pad;
    tooltip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  };
}

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}
