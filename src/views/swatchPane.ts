import { type Vec3, oklabToOklch } from '../color/oklab';
import { LAYOUTS, type Paint, type PaintLayout, PAINTS, paintLabel } from '../paints/vallejo';
import type { Store } from '../state';

export type PaintHoverHandler = (lab: Vec3 | null, clientX: number, clientY: number, paint?: Paint) => void;

const STORAGE_KEY = 'color-tools.vallejo-layout';

/**
 * Vallejo paints laid out the way the official charts print them. Clicking a swatch picks its
 * color, which moves both slices through it, exactly like clicking a color in one of the views.
 */
export class SwatchPane {
  onHover: PaintHoverHandler | null = null;

  /** The paint last clicked, with the exact pick vector it set. */
  private selected: { paint: Paint; pick: Vec3 } | null = null;
  private layout: PaintLayout;
  private hovering = false;

  constructor(
    private readonly grid: HTMLElement,
    select: HTMLSelectElement,
    private readonly note: HTMLElement,
    private readonly store: Store,
  ) {
    for (const layout of LAYOUTS) select.add(new Option(layout.title, layout.id));
    this.layout = LAYOUTS.find((l) => l.id === readStoredLayout()) ?? LAYOUTS[0];
    select.value = this.layout.id;
    select.addEventListener('change', () => {
      this.layout = LAYOUTS.find((l) => l.id === select.value) ?? LAYOUTS[0];
      storeLayout(this.layout.id);
      this.render();
    });

    grid.addEventListener('click', (e) => {
      const paint = this.paintAt(e.target);
      if (paint) this.pick(paint);
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
      if (changed.has('pick')) this.markSelected();
    });
    this.render();
  }

  /** The paint the current pick came from, or null when it was picked in one of the views. */
  get pickedPaint(): Paint | null {
    return this.selected && this.selected.pick === this.store.get().pick ? this.selected.paint : null;
  }

  private pick(paint: Paint): void {
    const pick: Vec3 = [...paint.lab];
    const [L, C, h] = oklabToOklch(pick);
    this.selected = { paint, pick };
    // A neutral has no hue; keep the hue slice where it is.
    this.store.set({ pick, L, h: C > 1e-4 ? h : this.store.get().h });
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
    this.markSelected();
  }

  private swatch(code: string, row?: number, column?: number): HTMLButtonElement {
    const paint = PAINTS.get(code)!;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.code = code;
    button.style.background = paint.rgb;
    if (row && column) {
      button.style.gridRow = String(row);
      button.style.gridColumn = String(column);
    }
    button.setAttribute('aria-label', paintLabel(paint));
    button.setAttribute('aria-pressed', 'false');
    return button;
  }

  /** Highlights every swatch of the picked paint; combination tables list some paints several times. */
  private markSelected(): void {
    const code = this.pickedPaint?.code;
    for (const button of this.grid.querySelectorAll<HTMLButtonElement>('.swatch')) {
      button.setAttribute('aria-pressed', String(button.dataset.code === code));
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
