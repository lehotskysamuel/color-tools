import './style.css';
import {
  AB_RANGE,
  JND,
  type Vec3,
  deltaEOK,
  formatOklab,
  formatOklch,
  isOklabInGamut,
  oklabToDisplayHex,
  oklabToHex,
  oklabToOklch,
} from './color/oklab';
import { type Paint, paintLabel } from './paints/vallejo';
import { type AppState, type CutMode, type Gamut, type ShapeStyle, createStore } from './state';
import { onThemeChange } from './theme';
import { GamutSolid } from './views/gamutSolid';
import { HueSlice } from './views/hueSlice';
import { LightnessSlice } from './views/lightnessSlice';
import { SwatchPane } from './views/swatchPane';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Start on the blue / amber hue plane: its two halves peak at very different lightness,
// which is the clearest picture of why HSL's "same lightness" is misleading.
const START_H = 264;
// The first pick is the neutral gray at mid lightness. It lies on the gray axis, so it is in every hue slice.
const START_L = 0.5;
const store = createStore({
  L: START_L,
  h: START_H,
  pick: [START_L, 0, 0],
  pickPaint: null,
  paints: [],
  hover: null,
  cut: 'whole',
  gamut: 'pointer',
  gamutStyle: 'wireframe',
  hull: true,
  hullStyle: 'solid',
});

const lightness = new LightnessSlice(store, $('b1-stat'));
const hue = new HueSlice(store, $('b2-stat'));
$('b1-host').appendChild(lightness.canvas);
$('b2-host').appendChild(hue.canvas);

const solidHost = $('solid-host');
const solid = new GamutSolid(solidHost, store, lightness.image, hue.image, $('a-stat'));
lightness.onImageChange = () => solid.lightnessImageChanged();
hue.onImageChange = () => solid.hueImageChanged();

const swatches = new SwatchPane(
  {
    grid: $('swatch-grid'),
    select: $<HTMLSelectElement>('layout-select'),
    note: $('swatch-note'),
    count: $('swatch-count'),
    showAll: $<HTMLButtonElement>('show-all'),
    showNone: $<HTMLButtonElement>('show-none'),
  },
  store,
);

// Controls
const lSlider = $<HTMLInputElement>('l-slider');
const hSlider = $<HTMLInputElement>('h-slider');
const lValue = $<HTMLOutputElement>('l-value');
const hValue = $<HTMLOutputElement>('h-value');
lSlider.addEventListener('input', () => store.set({ L: Number(lSlider.value) }));
hSlider.addEventListener('input', () => store.set({ h: Number(hSlider.value) }));
$('reset-view').addEventListener('click', () => solid.resetView());

/** Segmented controls: each is a fieldset of radios whose value is written to the state. */
const segmented: { id: string; value: (s: AppState) => string; patch: (value: string) => Partial<AppState> }[] = [
  { id: 'cut-mode', value: (s) => s.cut, patch: (v) => ({ cut: v as CutMode }) },
  { id: 'gamut', value: (s) => s.gamut, patch: (v) => ({ gamut: v as Gamut }) },
  { id: 'gamut-style', value: (s) => s.gamutStyle, patch: (v) => ({ gamutStyle: v as ShapeStyle }) },
  { id: 'hull', value: (s) => (s.hull ? 'on' : 'off'), patch: (v) => ({ hull: v === 'on' }) },
  { id: 'hull-style', value: (s) => s.hullStyle, patch: (v) => ({ hullStyle: v as ShapeStyle }) },
];
for (const { id, patch } of segmented) {
  for (const input of document.querySelectorAll<HTMLInputElement>(`#${id} input`)) {
    input.addEventListener('change', () => input.checked && store.set(patch(input.value)));
  }
}
const hullStyle = $<HTMLFieldSetElement>('hull-style');

// Picked-color readout
const readout = document.querySelector<HTMLElement>('.readout')!;
const pickPaintOut = $<HTMLOutputElement>('pick-paint');
const pickSwatch = $('pick-swatch');
const pickOklch = $<HTMLOutputElement>('pick-oklch');
const pickHex = $<HTMLOutputElement>('pick-hex');
const pickOklab = $<HTMLOutputElement>('pick-oklab');

function renderControls(): void {
  const state = store.get();
  const { L, h, pick, pickPaint } = state;
  if (document.activeElement !== lSlider) lSlider.value = String(L);
  if (document.activeElement !== hSlider) hSlider.value = String(Math.round(h) % 360);
  lValue.value = L.toFixed(3);
  hValue.value = `${h.toFixed(h % 1 === 0 ? 0 : 1)}°`;
  // A paint can lie outside sRGB; the swatch then shows the nearest screen color.
  const hex = oklabToDisplayHex(pick);
  pickSwatch.style.background = hex;
  pickOklch.value = formatOklch(oklabToOklch(pick));
  pickHex.value = isOklabInGamut(pick) ? hex : `outside sRGB, shown as ${hex}`;
  pickOklab.value = formatOklab(pick);
  pickPaintOut.value = pickPaint ? paintLabel(pickPaint) : '';
  readout.classList.toggle('has-paint', pickPaint !== null);
  for (const { id, value } of segmented) {
    const radio = document.querySelector<HTMLInputElement>(`#${id} input[value="${value(state)}"]`);
    if (radio) radio.checked = true;
  }
  hullStyle.disabled = !state.hull;
}

store.subscribe((_s, changed) => {
  const keys = ['L', 'h', 'pick', 'pickPaint', 'cut', 'gamut', 'gamutStyle', 'hull', 'hullStyle'] as const;
  if (keys.some((key) => changed.has(key))) renderControls();
});
renderControls();

// Hover tooltip, shared by the three views and the paint swatches
const tooltip = $('tooltip');
const tipName = $('tip-name');
const tipSwatch = $('tip-swatch');
const tipMain = $('tip-main');
const tipSub = $('tip-sub');

function showHover(lab: Vec3 | null, clientX: number, clientY: number, paint?: Paint): void {
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
}

lightness.onHover = showHover;
hue.onHover = showHover;
solid.onHover = showHover;
swatches.onHover = showHover;

// Layout: both slices share one pixel scale, so a given distance looks the same size in each.
const views = document.querySelector<HTMLElement>('.views')!;

function layout(): void {
  const width = $('b2-host').clientWidth;
  // One column when the views area is narrow, two or three otherwise (container queries in style.css).
  const stacked = getComputedStyle(views).gridTemplateColumns.split(' ').length < 2;
  const b1Margins = lightness.sizeAt(0);
  const b2Margins = hue.sizeAt(0);
  const maxPlotHeight = stacked ? window.innerHeight * 0.8 : Math.max(380, window.innerHeight - 280);
  const scale = Math.max(
    120,
    Math.min(
      (width - b1Margins.width) / (2 * AB_RANGE),
      (width - b2Margins.width) / (2 * AB_RANGE),
      maxPlotHeight - b2Margins.height,
    ),
  );
  lightness.setScale(scale);
  hue.setScale(scale);
  const solidHeight = stacked ? Math.min(width * 1.1, window.innerHeight * 0.75) : hue.sizeAt(scale).height;
  solid.setSize(solidHost.clientWidth, solidHeight);
}

let layoutFrame = 0;
const scheduleLayout = () => {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    layout();
  });
};
new ResizeObserver(scheduleLayout).observe(views);
window.addEventListener('resize', scheduleLayout);
layout();

onThemeChange(() => {
  lightness.refreshTheme();
  hue.refreshTheme();
});
document.fonts?.ready.then(() => {
  lightness.refreshTheme();
  hue.refreshTheme();
});
