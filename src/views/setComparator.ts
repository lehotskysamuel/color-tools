import { srgbShareOfPointer } from '../color/coverage';
import { allLayouts, appendLayoutGroups } from '../paints/customSets';
import { PAINT_TYPES, summarizeSet } from '../paints/summary';
import { type Store, createStore, initialState } from '../state';
import { GamutSolid, type SolidView } from './gamutSolid';
import { HueSlice } from './hueSlice';
import { LightnessSlice } from './lightnessSlice';
import type { HoverHandler } from './slicePlot';
import type { Tooltip } from './tooltip';

const STORAGE_KEY = 'color-tools.compared-sets';
const DEFAULT_SETS = ['gameColor', 'squidmarColorMegaSet'];
/** A comparison needs two sets, so the remove buttons show only above this many. */
const MIN_SETS = 2;
/** Each render has its own WebGL context, and a page gets only about 16; the deep-dive's solid takes one. */
const MAX_SETS = 8;
/** Pixels per OKLab unit of the slice images on the cut faces: sharp up to about 1.5× zoom on a large render. */
const CAP_SCALE = 600;

export interface SetComparatorElements {
  grid: HTMLElement;
  add: HTMLButtonElement;
  reset: HTMLButtonElement;
}

/** What a card needs from the comparator. */
interface CardContext {
  /** The slices whose images are the cut faces. */
  lightness: LightnessSlice;
  hue: HueSlice;
  hover: HoverHandler;
  /** The view a new render starts at, or null for the default. */
  view(): SolidView | null;
  viewChanged(card: SetCard, view: SolidView): void;
  /** A column switched sets; its new render has not been sized yet. */
  setChanged(): void;
  remove(card: SetCard): void;
}

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** One column of the comparison: a layout select over the set's render, coverage and paint counts. */
class SetCard {
  readonly element = el('section', 'panel set-card');
  readonly host = el('div', 'plot plot-solid');
  readonly removeButton = el('button', 'icon-button remove-set', '×');
  readonly select = el('select', 'select set-select');
  store!: Store;
  solid!: GamutSolid;
  private readonly source = el('p', 'stat');
  private readonly coverage = el('div', 'coverage');
  private readonly table = el('table', 'type-table');

  constructor(
    layoutId: string,
    private readonly ctx: CardContext,
  ) {
    appendLayoutGroups(this.select);
    this.select.setAttribute('aria-label', 'Paint set');
    this.select.addEventListener('change', () => {
      this.show(this.select.value);
      ctx.setChanged();
    });
    this.removeButton.type = 'button';
    this.removeButton.addEventListener('click', () => ctx.remove(this));
    const pick = el('div', 'set-card-pick');
    pick.append(this.select, this.removeButton);
    const head = el('header', 'set-card-head');
    head.append(pick, this.source);
    this.element.append(head, this.host, this.coverage, this.table);
    this.show(layoutId);
  }

  get layoutId(): string {
    return this.select.value;
  }

  /** Shows a set, replacing the one shown before. */
  show(id: string): void {
    const layout = allLayouts().find((l) => l.id === id) ?? allLayouts()[0];
    const { paints, types, notInCatalog, pointerCoverage } = summarizeSet(layout);
    this.select.value = layout.id;
    this.select.title = layout.title; // a narrow column cuts the name short
    this.element.setAttribute('aria-label', layout.title);
    this.removeButton.setAttribute('aria-label', `Remove ${layout.title}`);
    this.source.textContent = layout.source;

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
    this.coverage.replaceChildren(
      el('span', 'eyebrow', "Pointer's gamut covered"),
      el('span', 'coverage-value', pointerCoverage === null ? 'No volume' : pct(pointerCoverage)),
      meter,
      markLabel,
    );

    const row = (label: string, count: number, className = '') => {
      const tr = el('tr', className);
      const th = el('th', '', label);
      th.scope = 'row';
      tr.append(th, el('td', count === 0 ? 'none' : '', count === 0 ? '–' : String(count)));
      return tr;
    };
    const body = el('tbody');
    body.append(
      row('Colors', paints.length, 'total'),
      ...PAINT_TYPES.map((type) => row(type[0].toUpperCase() + type.slice(1), types.get(type)!)),
    );
    // Only paint sets hold items without a color, so only they get the row.
    if (notInCatalog > 0) body.append(row('No color data', notInCatalog, 'off-catalog'));
    this.table.replaceChildren(body);

    this.solid?.dispose();
    this.host.replaceChildren();
    this.store = createStore(initialState(paints));
    const { lightness, hue } = this.ctx;
    this.solid = new GamutSolid(this.host, this.store, lightness.image, hue.image, { picking: false });
    this.solid.onHover = this.ctx.hover;
    this.solid.onViewChange = (view) => this.ctx.viewChanged(this, view);
    const view = this.ctx.view();
    if (view) this.solid.setView(view);
  }

  dispose(): void {
    this.solid.dispose();
    this.element.remove();
  }
}

/**
 * Paint sets side by side: each set's view A as the deep-dive first draws it, its coverage of Pointer's gamut,
 * and how many paints of each type it has. Each column picks its set from the same layouts as the deep-dive.
 * The renders share one camera, so orbiting or zooming any of them moves them all, and the color under the
 * pointer is marked in each.
 */
export class SetComparator {
  private readonly cards: SetCard[] = [];
  /** The view all renders show, or null while it is the default one every render starts with. */
  private view: SolidView | null = null;
  private readonly context: CardContext;
  private layoutFrame = 0;

  constructor(
    private readonly els: SetComparatorElements,
    private readonly tooltip: Tooltip,
  ) {
    // Never on screen: their images at the starting L and h are the cut faces, when the starting state cuts.
    const slices = createStore(initialState());
    const lightness = new LightnessSlice(slices, null);
    const hue = new HueSlice(slices, null);
    lightness.setScale(CAP_SCALE);
    hue.setScale(CAP_SCALE);
    lightness.onImageChange = () => this.cards.forEach((card) => card.solid.lightnessImageChanged());
    hue.onImageChange = () => this.cards.forEach((card) => card.solid.hueImageChanged());

    this.context = {
      lightness,
      hue,
      hover: (lab, clientX, clientY, paint) => {
        for (const card of this.cards) card.store.set({ hover: lab });
        if (lab) this.tooltip.show(lab, clientX, clientY, paint);
        else this.tooltip.hide();
      },
      view: () => this.view,
      viewChanged: (from, view) => {
        this.view = view;
        for (const card of this.cards) if (card !== from) card.solid.setView(view);
      },
      setChanged: () => {
        // A new render starts at the canvas's default 300×150, and nothing else resizes it when the column keeps
        // its size, so size it before its first frame.
        this.layout();
        this.save();
      },
      remove: (card) => this.remove(card),
    };

    for (const id of readStoredSets() ?? DEFAULT_SETS) this.add(id);
    els.add.addEventListener('click', () => {
      // The first set no column shows yet, so a new column adds something to compare.
      const shown = new Set(this.cards.map((card) => card.layoutId));
      const card = this.add((allLayouts().find((l) => !shown.has(l.id)) ?? allLayouts()[0]).id);
      card.select.focus();
      this.save();
    });
    els.reset.addEventListener('click', () => {
      for (const card of this.cards) card.solid.resetView();
      this.view = null;
    });

    const scheduleLayout = () => {
      if (this.layoutFrame) return;
      this.layoutFrame = requestAnimationFrame(() => {
        this.layoutFrame = 0;
        this.layout();
      });
    };
    new ResizeObserver(scheduleLayout).observe(els.grid);
    window.addEventListener('resize', scheduleLayout);
  }

  private add(id: string): SetCard {
    const card = new SetCard(id, this.context);
    this.cards.push(card);
    this.els.grid.append(card.element);
    this.update();
    return card;
  }

  private remove(card: SetCard): void {
    const i = this.cards.indexOf(card);
    this.cards.splice(i, 1);
    card.dispose();
    this.tooltip.hide();
    this.update();
    // Keep the keyboard in the same place: the next column's remove button, or the previous one's.
    const next = this.cards[Math.min(i, this.cards.length - 1)];
    (next.removeButton.hidden ? next.select : next.removeButton).focus();
    this.save();
  }

  private update(): void {
    const removable = this.cards.length > MIN_SETS;
    for (const card of this.cards) card.removeButton.hidden = !removable;
    const full = this.cards.length >= MAX_SETS;
    this.els.add.disabled = full;
    this.els.add.title = full ? `Up to ${MAX_SETS} sets at once` : '';
    this.layout();
  }

  /** Every render the same size: as wide as its column, a little taller than wide, at most 70% of the window. */
  private layout(): void {
    const width = this.cards[0]?.host.clientWidth ?? 0;
    if (width === 0) return; // the tab is hidden
    const height = Math.max(240, Math.min(width * 1.1, window.innerHeight * 0.7));
    for (const card of this.cards) card.solid.setSize(card.host.clientWidth, height);
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cards.map((card) => card.layoutId)));
    } catch {
      // Storage can be unavailable (private mode, blocked site data); the sets just aren't remembered.
    }
  }
}

/** The stored sets, or null when there are too few to compare; ids of layouts that no longer exist are dropped. */
function readStoredSets(): string[] | null {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!Array.isArray(ids)) return null;
    const known = ids.filter((id) => allLayouts().some((l) => l.id === id)).slice(0, MAX_SETS);
    return known.length >= MIN_SETS ? known : null;
  } catch {
    return null;
  }
}
