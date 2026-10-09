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
  oklabToOklch,
} from './color/oklab';
import { type Paint, paintLabel } from './paints/vallejo';
import { type AppState, type CutMode, type Gamut, type ShapeStyle, createStore, initialState } from './state';
import { initTabs } from './tabs';
import { onThemeChange } from './theme';
import { GamutSolid } from './views/gamutSolid';
import { HueSlice } from './views/hueSlice';
import { LightnessSlice } from './views/lightnessSlice';
import { SetComparator } from './views/setComparator';
import { SwatchPane } from './views/swatchPane';
import { Tooltip } from './views/tooltip';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const store = createStore(initialState());

const lightness = new LightnessSlice(store, $('b1-stat'));
const hue = new HueSlice(store, $('b2-stat'));
$('b1-host').appendChild(lightness.canvas);
$('b2-host').appendChild(hue.canvas);

const solidHost = $('solid-host');
const solid = new GamutSolid(solidHost, store, lightness.image, hue.image, { stat: $('a-stat') });
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

// Hover tooltip, shared by the three views, the paint swatches and the set comparator
const tooltip = new Tooltip({
  root: $('tooltip'),
  name: $('tip-name'),
  swatch: $('tip-swatch'),
  main: $('tip-main'),
  sub: $('tip-sub'),
});

function showHover(lab: Vec3 | null, clientX: number, clientY: number, paint?: Paint): void {
  store.set({ hover: lab });
  if (!lab) {
    tooltip.hide();
    return;
  }
  const dE = deltaEOK(lab, store.get().pick);
  tooltip.show(lab, clientX, clientY, paint, `ΔE ${dE.toFixed(3)} from picked (≈ ${(dE / JND).toFixed(1)} JND)`);
}

lightness.onHover = showHover;
hue.onHover = showHover;
solid.onHover = showHover;
swatches.onHover = showHover;

// Layout: both slices share one pixel scale, so a given distance looks the same size in each.
const views = document.querySelector<HTMLElement>('.views')!;

function layout(): void {
  const width = $('b2-host').clientWidth;
  if (width === 0) return; // the deep-dive tab is hidden
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

// Tabs. The comparator is built the first time it is shown: it computes every selected set's coverage and
// creates a WebGL context per set.
let comparator: SetComparator | null = null;
initTabs((tab) => {
  tooltip.hide();
  if (tab !== 'compare') return;
  comparator ??= new SetComparator(
    {
      grid: $('compare-grid'),
      add: $<HTMLButtonElement>('compare-add'),
      reset: $<HTMLButtonElement>('compare-reset'),
    },
    tooltip,
  );
});
