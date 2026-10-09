import { JND, deltaEOK } from '../color/oklab';
import { type Paint, paintLabel } from '../paints/vallejo';

/** Called with the two paints of the cell under the pointer, or null when there is none. */
export type PairHoverHandler = (pair: { row: Paint; column: Paint } | null, clientX: number, clientY: number) => void;

/** D: the OKLab distance between two paints, as the tooltip prints it. */
export const formatD = (dE: number) => dE.toFixed(3);

/** J: the same distance in just-noticeable differences. */
export const formatJ = (dE: number) => (dE / JND).toFixed(1);

/** Rows and columns rendered beyond the visible ones, so short scrolls need no new render. */
const OVERSCAN = 8;

/** A cell that holds a pair's values, not a header or a spacer. */
const DATA_CELL = 'tbody > tr:not(.matrix-gap) > td:not(.matrix-gap)';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Every pair of paints as a table: the paints as rows and, in the same order, as columns. The cell where two
 * paints meet holds J, their ΔE_OK in JNDs, so the table is symmetric with zeros on the diagonal. The header row and column stick while the table scrolls. Hovering a cell highlights its row and
 * column.
 *
 * All paints make 387 × 387 cells, which take seconds to lay out, so only the rows and columns in view (plus
 * OVERSCAN) are rendered. Spacers fill the rest: a row above and below, a column left and right of the
 * rendered block. That needs fixed cell sizes, which style.css gives as --head, --cell and --row.
 */
export class DifferenceMatrix {
  onHover: PairHoverHandler | null = null;

  private paints: readonly Paint[] = [];
  /** Rendered rows [r0, r1) and columns [c0, c1). */
  private r0 = 0;
  private r1 = 0;
  private c0 = 0;
  private c1 = 0;
  private hovered: HTMLTableCellElement | null = null;
  private frame = 0;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly table: HTMLTableElement,
  ) {
    scroller.addEventListener('scroll', () => this.scheduleUpdate(), { passive: true });
    new ResizeObserver(() => this.scheduleUpdate()).observe(scroller);
    table.addEventListener('pointermove', (e) => {
      const cell = (e.target as Element | null)?.closest<HTMLTableCellElement>(DATA_CELL) ?? null;
      this.hover(cell);
      if (cell) this.onHover?.(this.pairAt(cell), e.clientX, e.clientY);
    });
    table.addEventListener('pointerleave', () => this.hover(null));
  }

  setPaints(paints: readonly Paint[]): void {
    this.paints = paints;
    this.table.style.setProperty('--n', String(paints.length));
    this.table.setAttribute('aria-rowcount', String(paints.length + 1));
    this.table.setAttribute('aria-colcount', String(paints.length + 1));
    this.scroller.scrollTo(0, 0);
    this.update(true);
  }

  private scheduleUpdate(): void {
    // Scrolling moves the cells under the pointer, so whatever the tooltip shows is stale.
    this.hover(null);
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.update(false);
    });
  }

  /** Renders again when the visible rows or columns reach outside the rendered ones. */
  private update(force: boolean): void {
    const n = this.paints.length;
    const css = getComputedStyle(this.table);
    const [head, cell, row] = ['--head', '--cell', '--row'].map((name) => parseFloat(css.getPropertyValue(name)));
    const { scrollTop, scrollLeft, clientWidth, clientHeight } = this.scroller;
    // The sticky header row and column cover part of the view, so this can include a row or column too many.
    const rowsFrom = Math.floor(scrollTop / row);
    const rowsTo = Math.min(n, Math.ceil((scrollTop + clientHeight) / row));
    const colsFrom = Math.floor(scrollLeft / cell);
    const colsTo = Math.min(n, Math.ceil((scrollLeft + clientWidth - head) / cell));
    const inside = rowsFrom >= this.r0 && rowsTo <= this.r1 && colsFrom >= this.c0 && colsTo <= this.c1;
    if (inside && !force) return;
    this.r0 = Math.max(0, rowsFrom - OVERSCAN);
    this.r1 = Math.min(n, rowsTo + OVERSCAN);
    this.c0 = Math.max(0, colsFrom - OVERSCAN);
    this.c1 = Math.min(n, colsTo + OVERSCAN);
    this.render(cell, row);
  }

  private render(cell: number, row: number): void {
    const { paints, r0, r1, c0, c1 } = this;
    const n = paints.length;
    const swatch = (paint: Paint) => `<span class="matrix-swatch" style="background:${paint.webhex}"></span>`;
    const title = (paint: Paint) => `title="${escapeHtml(paintLabel(paint))}"`;
    const gapCell = '<td class="matrix-gap" aria-hidden="true"></td>';
    const gapRow = (rows: number) =>
      `<tr class="matrix-gap" aria-hidden="true" style="height:${rows * row}px"><td colspan="${c1 - c0 + 3}"></td></tr>`;

    const html: string[] = [
      '<colgroup><col>',
      `<col style="width:${c0 * cell}px">`,
      '<col>'.repeat(c1 - c0),
      `<col style="width:${(n - c1) * cell}px">`,
      '</colgroup>',
      '<thead><tr aria-rowindex="1"><td class="matrix-corner"></td>',
      gapCell,
    ];
    for (let j = c0; j < c1; j++) {
      const paint = paints[j];
      // A paint without a code is headed by its name, cut to the column's width; the title has it in full.
      html.push(`<th scope="col" aria-colindex="${j + 2}" ${title(paint)}>${swatch(paint)}${escapeHtml(paint.code ?? paint.name)}</th>`);
    }
    html.push(gapCell, '</tr></thead><tbody>', gapRow(r0));
    for (let i = r0; i < r1; i++) {
      const paint = paints[i];
      html.push(
        `<tr aria-rowindex="${i + 2}"><th scope="row" aria-colindex="1" ${title(paint)}>${swatch(paint)}`,
        paint.code ? `<span class="mono">${paint.code}</span> ` : '',
        `<span class="matrix-name">${escapeHtml(paint.name)}</span> <span class="matrix-type">(${paint.type})</span></th>`,
        gapCell,
      );
      for (let j = c0; j < c1; j++) {
        const dE = deltaEOK(paint.lab, paints[j].lab);
        const self = i === j ? ' class="is-self"' : '';
        html.push(`<td aria-colindex="${j + 2}"${self}>${formatJ(dE)}</td>`);
      }
      html.push(gapCell, '</tr>');
    }
    html.push(gapRow(n - r1), '</tbody>');
    this.hover(null);
    this.table.innerHTML = html.join('');
  }

  private pairAt(cell: HTMLTableCellElement): { row: Paint; column: Paint } {
    // Body rows follow the top spacer row; cells follow the row header and the left spacer.
    const i = this.r0 + (cell.parentElement as HTMLTableRowElement).sectionRowIndex - 1;
    const j = this.c0 + cell.cellIndex - 2;
    return { row: this.paints[i], column: this.paints[j] };
  }

  /** Marks the cell's row and column headers and its column; the row itself is highlighted by CSS. */
  private hover(cell: HTMLTableCellElement | null): void {
    if (cell === this.hovered) return;
    for (const on of [false, true]) {
      const target = on ? cell : this.hovered;
      if (!target) continue;
      // The header row and the colgroup line up with the body cells: the same cellIndex is the same column.
      (target.parentElement as HTMLTableRowElement).cells[0].classList.toggle('is-hover', on);
      this.table.tHead!.rows[0].cells[target.cellIndex].classList.toggle('is-hover', on);
      this.table.querySelector('colgroup')!.children[target.cellIndex].classList.toggle('is-hover', on);
    }
    this.hovered = cell;
    if (!cell) this.onHover?.(null, 0, 0);
  }
}
