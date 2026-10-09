import { ALL_LAYOUTS, appendLayoutGroups } from '../paints/sets';
import { type Paint, type PaintLayout, PAINTS, paintLabel } from '../paints/vallejo';
import { type Store, pickPaint } from '../state';
import type { HoverHandler } from './slicePlot';

const STORAGE_KEY = 'color-tools.vallejo-layout';

export interface SwatchPaneElements {
  grid: HTMLElement;
  select: HTMLSelectElement;
  /** Receives the layout's source and how to read it. */
  note: HTMLElement;
  /** Receives "n of m shown". */
  count: HTMLElement;
  showAll: HTMLButtonElement;
  showNone: HTMLButtonElement;
}

/**
 * Paints laid out the way their makers print them, or the paints of a set. The shown paints are drawn as dots in
 * the views. Clicking a swatch shows or hides its paint; showing a paint also picks it, which moves both slices
 * through it. A new layout starts with all of its paints shown.
 */
export class SwatchPane {
  onHover: HoverHandler | null = null;

  private readonly grid: HTMLElement;
  private readonly note: HTMLElement;
  private readonly count: HTMLElement;
  private layout: PaintLayout;
  /** Ids of the paints in this layout, once each, in printed order. */
  private ids: string[] = [];
  /** Ids of each section's paints, indexed by the section's select-all and select-none buttons. */
  private sectionIds: string[][] = [];
  private shown = new Set<string>();
  private hovering = false;

  constructor(
    { grid, select, note, count, showAll, showNone }: SwatchPaneElements,
    private readonly store: Store,
  ) {
    this.grid = grid;
    this.note = note;
    this.count = count;
    appendLayoutGroups(select);
    this.layout = ALL_LAYOUTS.find((l) => l.id === readStoredLayout()) ?? ALL_LAYOUTS[0];
    select.value = this.layout.id;
    select.addEventListener('change', () => {
      this.layout = ALL_LAYOUTS.find((l) => l.id === select.value) ?? ALL_LAYOUTS[0];
      storeLayout(this.layout.id);
      this.render();
    });
    showAll.addEventListener('click', () => this.show(this.ids));
    showNone.addEventListener('click', () => this.show([]));

    grid.addEventListener('click', (e) => {
      const select = (e.target as Element | null)?.closest<HTMLButtonElement>('.section-select');
      if (select) {
        const ids = this.sectionIds[Number(select.dataset.section)];
        const shown = new Set(this.shown);
        for (const id of ids) {
          if (select.dataset.select === 'all') shown.add(id);
          else shown.delete(id);
        }
        this.show(shown);
        return;
      }
      const paint = this.paintAt(e.target);
      if (paint) this.toggle(paint);
    });
    grid.addEventListener('pointermove', (e) => {
      const paint = this.paintAt(e.target);
      this.hovering = paint !== null;
      this.onHover?.(paint?.lab ?? null, e.clientX, e.clientY, paint ?? undefined);
    });
    grid.addEventListener('pointerleave', () => {
      if (!this.hovering) return;
      this.hovering = false;
      this.onHover?.(null, 0, 0);
    });

    store.subscribe((_state, changed) => {
      if (changed.has('pickPaint')) this.markPicked();
    });
    this.render();
  }

  /** Hiding a paint leaves the pick alone, so double-clicking a shown paint (hide, show) picks it. */
  private toggle(paint: Paint): void {
    const shown = new Set(this.shown);
    if (shown.delete(paint.id)) {
      this.show(shown);
    } else {
      shown.add(paint.id);
      this.show(shown);
      pickPaint(this.store, paint);
    }
  }

  private show(ids: Iterable<string>): void {
    this.shown = new Set(ids);
    const paints = this.ids.filter((id) => this.shown.has(id)).map((id) => PAINTS.get(id)!);
    this.store.set({ paints });
    this.count.textContent = `${paints.length} of ${this.ids.length} shown`;
    for (const button of this.grid.querySelectorAll<HTMLButtonElement>('.swatch')) {
      button.setAttribute('aria-pressed', String(this.shown.has(button.dataset.id!)));
    }
  }

  private paintAt(target: EventTarget | null): Paint | null {
    const button = (target as Element | null)?.closest<HTMLButtonElement>('.swatch');
    return (button && PAINTS.get(button.dataset.id!)) ?? null;
  }

  private render(): void {
    const { sections, notInCatalog } = this.layout;
    const grid = this.grid;
    grid.replaceChildren();
    this.sectionIds = sections.map((s) => s.rows.flat());
    // The hovered swatch is gone, and no pointerleave will fire for it.
    if (this.hovering) {
      this.hovering = false;
      this.onHover?.(null, 0, 0);
    }

    if (notInCatalog) {
      // Sets have no printed order: the paints flow in code order, as many to a row as fit (style.css). A custom
      // set shows each of its sets under its own heading.
      sections.forEach((section, i) => {
        if (section.title && sections.length > 1) grid.append(heading(i, section.title));
        const chart = document.createElement('div');
        chart.className = 'swatch-chart swatch-flow';
        for (const id of section.rows.flat()) chart.append(this.swatch(id));
        grid.append(chart);
      });
      const set = sections.length > 1 ? 'sets' : 'set';
      // "72.052 Silver (metallic)", but not "72.650 Gloss Polyurethane Varnish (varnish)".
      const missing = notInCatalog.map(({ code, name, kind }) =>
        name.toLowerCase().includes(kind.toLowerCase()) ? `${code} ${name}` : `${code} ${name} (${kind})`,
      );
      this.note.textContent =
        `The paints of ${this.layout.source}, by code.` +
        (missing.length
          ? ` Also in the ${set}, but not in the data: ${missing.join(', ').replace(/, (?=[^,]*$)/, ' and ')}.`
          : '');
    } else {
      // Charts: sections stacked, every printed row starting in the first column. The heading goes above its
      // section's chart, so the swatches alone sit on the stage gray.
      const width = Math.max(...sections.flatMap((s) => s.rows.map((row) => row.length)));
      sections.forEach((section, i) => {
        if (section.title && sections.length > 1) grid.append(heading(i, section.title));
        const chart = document.createElement('div');
        chart.className = 'swatch-chart';
        chart.style.gridTemplateColumns = `repeat(${width}, minmax(0, var(--swatch-max)))`;
        section.rows.forEach((row, r) => row.forEach((id, c) => chart.append(this.swatch(id, r + 1, c + 1))));
        grid.append(chart);
      });
      this.note.textContent = `Order as printed in ${this.layout.source}.`;
    }
    this.ids = [...new Set(sections.flatMap((s) => s.rows.flat()))];
    this.show(this.ids);
    this.markPicked();
  }

  private swatch(id: string, row?: number, column?: number): HTMLButtonElement {
    const paint = PAINTS.get(id)!;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.id = id;
    // Only the color: a hidden paint's swatch shrinks by clipping the background to the content box.
    button.style.backgroundColor = paint.webhex;
    if (row && column) {
      button.style.gridRow = String(row);
      button.style.gridColumn = String(column);
    }
    button.setAttribute('aria-label', paintLabel(paint));
    button.setAttribute('aria-pressed', 'false');
    return button;
  }

  /** Outlines every swatch of the picked paint; a custom set can hold a paint in more than one of its sets. */
  private markPicked(): void {
    const id = this.store.get().pickPaint?.id;
    for (const button of this.grid.querySelectorAll<HTMLButtonElement>('.swatch')) {
      button.classList.toggle('is-picked', button.dataset.id === id);
    }
  }
}

/** A section's title with its select-all and select-none buttons. */
function heading(section: number, title: string): HTMLDivElement {
  const heading = document.createElement('div');
  heading.className = 'swatch-heading';
  const h3 = document.createElement('h3');
  h3.className = 'eyebrow';
  h3.textContent = title;
  heading.append(h3, sectionSelect(section, 'all', title), sectionSelect(section, 'none', title));
  return heading;
}

function sectionSelect(section: number, select: 'all' | 'none', title: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button section-select';
  button.dataset.section = String(section);
  button.dataset.select = select;
  button.textContent = select === 'all' ? 'All' : 'None';
  button.setAttribute('aria-label', `Select ${select} in ${title}`);
  return button;
}

function readStoredLayout(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLayout(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice just isn't remembered.
  }
}
