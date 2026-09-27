import { LAYOUTS, type Paint, type PaintLayout, PAINTS, paintLabel } from '../paints/vallejo';
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
 * Vallejo paints laid out the way the official charts print them. The shown paints are drawn as dots in
 * the views. Clicking a swatch shows or hides its paint; showing a paint also picks it, which moves both
 * slices through it. A new layout starts with all of its paints shown.
 */
export class SwatchPane {
  onHover: HoverHandler | null = null;

  private readonly grid: HTMLElement;
  private readonly note: HTMLElement;
  private readonly count: HTMLElement;
  private layout: PaintLayout;
  /** Codes of the paints in this layout, once each, in printed order. */
  private codes: string[] = [];
  private shown = new Set<string>();
  private hovering = false;

  constructor(
    { grid, select, note, count, showAll, showNone }: SwatchPaneElements,
    private readonly store: Store,
  ) {
    this.grid = grid;
    this.note = note;
    this.count = count;
    for (const layout of LAYOUTS) select.add(new Option(layout.title, layout.id));
    this.layout = LAYOUTS.find((l) => l.id === readStoredLayout()) ?? LAYOUTS[0];
    select.value = this.layout.id;
    select.addEventListener('change', () => {
      this.layout = LAYOUTS.find((l) => l.id === select.value) ?? LAYOUTS[0];
      storeLayout(this.layout.id);
      this.render();
    });
    showAll.addEventListener('click', () => this.show(this.codes));
    showNone.addEventListener('click', () => this.show([]));

    grid.addEventListener('click', (e) => {
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
    if (shown.delete(paint.code)) {
      this.show(shown);
    } else {
      shown.add(paint.code);
      this.show(shown);
      pickPaint(this.store, paint);
    }
  }

  private show(codes: Iterable<string>): void {
    this.shown = new Set(codes);
    const paints = this.codes.filter((code) => this.shown.has(code)).map((code) => PAINTS.get(code)!);
    this.store.set({ paints });
    this.count.textContent = `${paints.length} of ${this.codes.length} shown`;
    for (const button of this.grid.querySelectorAll<HTMLButtonElement>('.swatch')) {
      button.setAttribute('aria-pressed', String(this.shown.has(button.dataset.code!)));
    }
  }

  private paintAt(target: EventTarget | null): Paint | null {
    const button = (target as Element | null)?.closest<HTMLButtonElement>('.swatch');
    return (button && PAINTS.get(button.dataset.code!)) ?? null;
  }

  private render(): void {
    const { sections, columns } = this.layout;
    const grid = this.grid;
    grid.replaceChildren();
    grid.classList.toggle('is-combinations', !!columns);
    // The hovered swatch is gone, and no pointerleave will fire for it.
    if (this.hovering) {
      this.hovering = false;
      this.onHover?.(null, 0, 0);
    }

    if (columns) {
      // Combination tables: each printed block is a column of [highlight, base, shadow] rows. The blocks sit
      // side by side as on the chart when the pane is wide enough, and wrap when it is not (style.css).
      grid.style.gridTemplateColumns = '';
      grid.style.setProperty('--triplet', String(columns.length));
      for (const section of sections) {
        const block = document.createElement('div');
        block.className = 'swatch-block';
        for (const code of section.rows.flat()) block.append(this.swatch(code));
        grid.append(block);
      }
      const triplet = columns.join(', ').replace(/, (?=[^,]*$)/, ' and ');
      this.note.textContent = `Each row is a ${triplet} triplet. Order as printed in ${this.layout.source}.`;
    } else {
      // Charts: sections stacked, every printed row starting in the first column.
      const width = Math.max(...sections.flatMap((s) => s.rows.map((row) => row.length)));
      grid.style.gridTemplateColumns = `repeat(${width}, minmax(0, var(--swatch-max)))`;
      let r = 1;
      for (const section of sections) {
        if (section.title && sections.length > 1) {
          const heading = document.createElement('h3');
          heading.className = 'swatch-heading eyebrow';
          heading.textContent = section.title;
          heading.style.gridRow = String(r++);
          grid.append(heading);
        }
        for (const row of section.rows) {
          row.forEach((code, c) => grid.append(this.swatch(code, r, c + 1)));
          r++;
        }
      }
      this.note.textContent = `Order as printed in ${this.layout.source}.`;
    }
    this.codes = [...new Set(sections.flatMap((s) => s.rows.flat()))];
    this.show(this.codes);
    this.markPicked();
  }

  private swatch(code: string, row?: number, column?: number): HTMLButtonElement {
    const paint = PAINTS.get(code)!;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.code = code;
    // Only the color: a hidden paint's swatch shrinks by clipping the background to the content box.
    button.style.backgroundColor = paint.rgb;
    if (row && column) {
      button.style.gridRow = String(row);
      button.style.gridColumn = String(column);
    }
    button.setAttribute('aria-label', paintLabel(paint));
    button.setAttribute('aria-pressed', 'false');
    return button;
  }

  /** Outlines every swatch of the picked paint; combination tables list some paints several times. */
  private markPicked(): void {
    const code = this.store.get().pickPaint?.code;
    for (const button of this.grid.querySelectorAll<HTMLButtonElement>('.swatch')) {
      button.classList.toggle('is-picked', button.dataset.code === code);
    }
  }
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
