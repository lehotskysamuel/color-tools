import './style.css';
import { deltaEOK } from './color/oklab';
import { ALL_LAYOUTS, appendLayoutGroups } from './paints/sets';
import { type Paint, PAINTS, paintLabel } from './paints/vallejo';
import { DifferenceMatrix, formatD, formatJ } from './views/diffMatrix';

const STORAGE_KEY = 'color-tools.matrix-layout';
/** Every paint in the catalog, once: the default, and the matrix's own choice beside the atlas's layouts. */
const ALL_PAINTS = 'allPaints';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const matrix = new DifferenceMatrix($('matrix-scroll'), $<HTMLTableElement>('matrix'));
const select = $<HTMLSelectElement>('layout-select');
const count = $('matrix-count');

// All paints, then the same groups of layouts as the atlas's paint pane.
select.add(new Option('All paints', ALL_PAINTS));
appendLayoutGroups(select);

/**
 * By code ascending. Every code is "NN.NNN", so comparing them as strings orders them by number. Paints
 * without a code (Kimera Kolors) come last, by name.
 */
function byCode(p: Paint, q: Paint): number {
  if (p.code && q.code) return p.code < q.code ? -1 : p.code > q.code ? 1 : 0;
  if (p.code || q.code) return p.code ? -1 : 1;
  return p.name.localeCompare(q.name);
}

function show(id: string): void {
  const layout = ALL_LAYOUTS.find((l) => l.id === id);
  select.value = layout ? layout.id : ALL_PAINTS;
  // Sets can share paints; each paint gets one row and one column.
  const ids = layout ? new Set(layout.sections.flatMap((s) => s.rows.flat())) : PAINTS.keys();
  const paints = [...ids].map((paintId) => PAINTS.get(paintId)!).sort(byCode);
  const n = paints.length;
  count.textContent = `${n} paints · ${((n * (n - 1)) / 2).toLocaleString('en')} pairs`;
  matrix.setPaints(paints);
}

select.addEventListener('change', () => {
  show(select.value);
  try {
    localStorage.setItem(STORAGE_KEY, select.value);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice just isn't remembered.
  }
});

let stored: string | null = null;
try {
  stored = localStorage.getItem(STORAGE_KEY);
} catch {
  // As above: start on the default.
}
show(stored ?? ALL_PAINTS);

// Hover tooltip: the two paints of the cell and their difference.
const tooltip = $('tooltip');
const tip = {
  rowSwatch: $('tip-row-swatch'),
  row: $('tip-row'),
  columnSwatch: $('tip-column-swatch'),
  column: $('tip-column'),
  values: $('tip-values'),
};

matrix.onHover = (pair, clientX, clientY) => {
  if (!pair) {
    tooltip.hidden = true;
    return;
  }
  const { row, column } = pair;
  const dE = deltaEOK(row.lab, column.lab);
  tip.rowSwatch.style.background = row.webhex;
  tip.row.textContent = paintLabel(row);
  tip.columnSwatch.style.background = column.webhex;
  tip.column.textContent = paintLabel(column);
  tip.values.textContent = `D ${formatD(dE)} ΔE · J ${formatJ(dE)} JND`;
  tooltip.hidden = false;
  const pad = 14;
  const { width, height } = tooltip.getBoundingClientRect();
  const x = clientX + pad + width > window.innerWidth ? clientX - pad - width : clientX + pad;
  const y = clientY + pad + height > window.innerHeight ? clientY - pad - height : clientY + pad;
  tooltip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
};
