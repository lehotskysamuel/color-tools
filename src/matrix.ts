import './style.css';
import { deltaEOK } from './color/oklab';
import { LAYOUTS, PAINTS, paintLabel } from './paints/vallejo';
import { DifferenceMatrix, formatD, formatJ } from './views/diffMatrix';

const STORAGE_KEY = 'color-tools.matrix-layout';
/** Every paint in the catalog, once. */
const DEFAULT_LAYOUT = 'allPaints';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const matrix = new DifferenceMatrix($('matrix-scroll'), $<HTMLTableElement>('matrix'));
const select = $<HTMLSelectElement>('layout-select');
const count = $('matrix-count');

// The same layouts as the atlas's paint pane.
for (const layout of LAYOUTS) select.add(new Option(layout.title, layout.id));

function show(id: string): void {
  const layout = LAYOUTS.find((l) => l.id === id) ?? LAYOUTS.find((l) => l.id === DEFAULT_LAYOUT)!;
  select.value = layout.id;
  // Combination tables repeat paints; each paint gets one row and one column, by code ascending. Every code
  // is "NN.NNN", so comparing them as strings orders them by number.
  const codes = [...new Set(layout.sections.flatMap((s) => s.rows.flat()))].sort();
  const n = codes.length;
  count.textContent = `${n} paints · ${((n * (n - 1)) / 2).toLocaleString('en')} pairs`;
  matrix.setPaints(codes.map((code) => PAINTS.get(code)!));
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
show(stored ?? DEFAULT_LAYOUT);

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
  tip.rowSwatch.style.background = row.display;
  tip.row.textContent = paintLabel(row);
  tip.columnSwatch.style.background = column.display;
  tip.column.textContent = paintLabel(column);
  tip.values.textContent = `D ${formatD(dE)} ΔE · J ${formatJ(dE)} JND`;
  tooltip.hidden = false;
  const pad = 14;
  const { width, height } = tooltip.getBoundingClientRect();
  const x = clientX + pad + width > window.innerWidth ? clientX - pad - width : clientX + pad;
  const y = clientY + pad + height > window.innerHeight ? clientY - pad - height : clientY + pad;
  tooltip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
};
