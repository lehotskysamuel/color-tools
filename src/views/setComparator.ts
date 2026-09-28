import { srgbShareOfPointer } from '../color/coverage';
import { PAINT_TYPES, summarizeSet } from '../paints/sets';
import { LAYOUTS, type PaintLayout } from '../paints/vallejo';
import { type Store, createStore, initialState } from '../state';
import { GamutSolid, type SolidView } from './gamutSolid';
import { HueSlice } from './hueSlice';
import { LightnessSlice } from './lightnessSlice';
import type { HoverHandler } from './slicePlot';
import type { Tooltip } from './tooltip';

const STORAGE_KEY = 'color-tools.compared-sets';
/** The three printed ranges, one set each. */
const DEFAULT_SETS = ['gameColor', 'modelColor', 'squidmarColorMegaSet'];
/** Pixels per OKLab unit of the slice images on the cut faces: sharp up to about 1.5× zoom on a large render. */
const CAP_SCALE = 600;

export interface SetComparatorElements {
  /** Receives one toggle button per set. */
  picker: HTMLElement;
  grid: HTMLElement;
  /** Shown while no set is selected. */
  empty: HTMLElement;
  reset: HTMLButtonElement;
}

interface Card {
  element: HTMLElement;
  host: HTMLElement;
  store: Store;
  solid: GamutSolid;
}

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/**
 * Paint sets side by side: each set's view A as the deep-dive first draws it, its coverage of Pointer's gamut,
 * and how many paints of each type it has. The renders share one camera, so orbiting or zooming any of them
 * moves them all, and the color under the pointer is marked in each.
 */
export class SetComparator {
  /** Built when a set is first selected and kept, so each set creates one WebGL context at most. */
  private readonly cards = new Map<string, Card>();
  private readonly selected: Set<string>;
  private shown: Card[] = [];
  /** The view all renders show, or null while it is the default one every render starts with. */
  private view: SolidView | null = null;
  /** Never on screen: their images at the starting L and h are the cut faces of every render. */
  private readonly lightness: LightnessSlice;
  private readonly hue: HueSlice;
  private layoutFrame = 0;

  constructor(
    private readonly els: SetComparatorElements,
    private readonly tooltip: Tooltip,
  ) {
    const slices = createStore(initialState());
    this.lightness = new LightnessSlice(slices, null);
    this.hue = new HueSlice(slices, null);
    this.lightness.setScale(CAP_SCALE);
    this.hue.setScale(CAP_SCALE);
    this.lightness.onImageChange = () => this.cards.forEach((card) => card.solid.lightnessImageChanged());
    this.hue.onImageChange = () => this.cards.forEach((card) => card.solid.hueImageChanged());

    this.selected = new Set(readStoredSets() ?? DEFAULT_SETS);
    for (const layout of LAYOUTS) {
      const button = el('button', 'button', layout.title);
      button.type = 'button';
      button.dataset.set = layout.id;
      button.addEventListener('click', () => this.toggle(layout.id));
      els.picker.append(button);
    }
    els.reset.addEventListener('click', () => this.resetView());

    const scheduleLayout = () => {
      if (this.layoutFrame) return;
      this.layoutFrame = requestAnimationFrame(() => {
        this.layoutFrame = 0;
        this.layout();
      });
    };
    new ResizeObserver(scheduleLayout).observe(els.grid);
    window.addEventListener('resize', scheduleLayout);
    this.render();
  }

  private toggle(id: string): void {
    if (!this.selected.delete(id)) this.selected.add(id);
    storeSets([...this.selected]);
    this.render();
  }

  /** The selected sets in the order of the layout list, whatever order they were picked in. */
  private render(): void {
    this.shown = LAYOUTS.filter((l) => this.selected.has(l.id)).map((l) => this.card(l));
    for (const card of this.shown) if (this.view) card.solid.setView(this.view);
    this.els.grid.replaceChildren(...this.shown.map((card) => card.element));
    this.els.empty.hidden = this.shown.length > 0;
    for (const button of this.els.picker.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String(this.selected.has(button.dataset.set!)));
    }
    this.layout();
  }

  /** Every render the same size: as wide as its column, a little taller than wide, at most 70% of the window. */
  private layout(): void {
    const width = this.shown[0]?.host.clientWidth ?? 0;
    if (width === 0) return; // no set selected, or the tab is hidden
    const height = Math.max(240, Math.min(width * 1.1, window.innerHeight * 0.7));
    for (const card of this.shown) card.solid.setSize(card.host.clientWidth, height);
  }

  private resetView(): void {
    // Hidden renders too, so a set shown again later starts at the default view like the others.
    for (const card of this.cards.values()) card.solid.resetView();
    this.view = null;
  }

  private syncView(from: Card, view: SolidView): void {
    this.view = view;
    for (const card of this.shown) if (card !== from) card.solid.setView(view);
  }

  private readonly hover: HoverHandler = (lab, clientX, clientY, paint) => {
    for (const card of this.shown) card.store.set({ hover: lab });
    if (lab) this.tooltip.show(lab, clientX, clientY, paint);
    else this.tooltip.hide();
  };

  private card(layout: PaintLayout): Card {
    const existing = this.cards.get(layout.id);
    if (existing) return existing;

    const { paints, types, pointerCoverage } = summarizeSet(layout);
    const element = el('section', 'panel set-card');
    const titleId = `set-${layout.id}-title`;
    element.setAttribute('aria-labelledby', titleId);

    const head = el('header', 'set-card-head');
    const title = el('h2', '', layout.title);
    title.id = titleId;
    head.append(title, el('p', 'stat', layout.source));

    const host = el('div', 'plot plot-solid');

    const coverage = el('div', 'coverage');
    const srgb = srgbShareOfPointer();
    const meter = el('div', 'meter');
    meter.setAttribute('aria-hidden', 'true');
    const fill = el('div', 'meter-fill');
    fill.style.width = pct(pointerCoverage ?? 0);
    const mark = el('div', 'meter-mark');
    mark.style.left = pct(srgb);
    const markLabel = el('span', 'meter-label', `sRGB ${Math.round(srgb * 100)}%`);
    markLabel.style.left = pct(srgb);
    meter.append(fill, mark);
    coverage.append(
      el('span', 'eyebrow', "Pointer's gamut covered"),
      el('span', 'coverage-value', pointerCoverage === null ? 'No volume' : pct(pointerCoverage)),
      meter,
      markLabel,
    );

    const table = el('table', 'type-table');
    const row = (label: string, count: number, className = '') => {
      const tr = el('tr', className);
      const th = el('th', '', label);
      th.scope = 'row';
      tr.append(th, el('td', count === 0 ? 'none' : '', count === 0 ? '–' : String(count)));
      return tr;
    };
    table.createTBody().append(
      row('Colors', paints.length, 'total'),
      ...PAINT_TYPES.map((type) => row(type[0].toUpperCase() + type.slice(1), types.get(type)!)),
    );

    element.append(head, host, coverage, table);

    const store = createStore(initialState(paints));
    const solid = new GamutSolid(host, store, this.lightness.image, this.hue.image, { picking: false });
    const card: Card = { element, host, store, solid };
    solid.onHover = this.hover;
    solid.onViewChange = (view) => this.syncView(card, view);
    this.cards.set(layout.id, card);
    return card;
  }
}

function readStoredSets(): string[] | null {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!Array.isArray(ids)) return null;
    return ids.filter((id) => LAYOUTS.some((l) => l.id === id));
  } catch {
    return null;
  }
}

function storeSets(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice just isn't remembered.
  }
}
