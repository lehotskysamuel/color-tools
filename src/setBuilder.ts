import './style.css';
import {
  type SavedSet,
  deleteSet,
  exportSet,
  onSavedSetsChange,
  readSavedSets,
  saveSet,
  setKey,
} from './paints/customSets';
import { SET_KEYS } from './paints/sets';
import { type Paint, PAINTS, paintLabel } from './paints/vallejo';
import { Selection } from './selection';
import { createStore } from './state';
import { GamutSolid } from './views/gamutSolid';
import { SHAPE_CONTROLS, bindSegmented } from './views/segmented';
import { SwatchPane, type SwatchPaneElements } from './views/swatchPane';
import { hoverTooltip } from './views/tooltip';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The set being built, kept between visits so a reload loses nothing. */
const DRAFT_KEY = 'color-tools.set-builder.draft';
const UNTITLED = 'Untitled set';

const store = createStore({
  L: 0.5,
  h: 264,
  pick: [0.5, 0, 0],
  pickPaint: null,
  paints: [],
  hover: null,
  cut: 'whole',
  gamut: 'pointer',
  gamutStyle: 'wireframe',
  hull: true,
  hullStyle: 'solid',
});
const selection = new Selection();
const showHover = hoverTooltip(store);

// Three paint columns that share the selection, each with its own layout, starting on the first three charts.
const panes = [...document.querySelectorAll<HTMLElement>('[data-pane]')].map((host, i) => {
  const pane = new SwatchPane(paneElements(host, i), store, {
    storageKey: `color-tools.set-builder.layout-${i + 1}`,
    defaultLayout: i,
    selection,
  });
  pane.onHover = showHover;
  return pane;
});

/** The controls of one column, as in the Atlas's paint pane. */
function paneElements(host: HTMLElement, i: number): SwatchPaneElements {
  const id = `layout-select-${i + 1}`;
  host.innerHTML = `
    <div class="controls">
      <label class="slider-label" for="${id}">Layout</label>
      <select class="select" id="${id}"></select>
    </div>
    <div class="controls">
      <button type="button" class="button" data-role="all">Select all</button>
      <button type="button" class="button" data-role="none">Select none</button>
      <output class="stat mono" data-role="count"></output>
    </div>
    <div class="swatch-grid"></div>
    <p class="stat" data-role="note"></p>`;
  const q = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  return {
    grid: q('.swatch-grid'),
    select: q<HTMLSelectElement>('select'),
    note: q('[data-role="note"]'),
    count: q('[data-role="count"]'),
    showAll: q<HTMLButtonElement>('[data-role="all"]'),
    showNone: q<HTMLButtonElement>('[data-role="none"]'),
  };
}

// The solid. It has no cut here, so its slice caps stay hidden and need no images.
const solidHost = $('solid-host');
const blank = () => document.createElement('canvas');
const solid = new GamutSolid(solidHost, store, blank(), blank(), $('solid-stat'));
solid.onHover = showHover;
$('reset-view').addEventListener('click', () => solid.resetView());

const checkSegmented = bindSegmented(store, SHAPE_CONTROLS);
const hullStyle = $<HTMLFieldSetElement>('hull-style');
const renderShapeControls = () => {
  checkSegmented();
  hullStyle.disabled = !store.get().hull;
};
store.subscribe((_s, changed) => {
  const keys = ['gamut', 'gamutStyle', 'hull', 'hullStyle'] as const;
  if (keys.some((key) => changed.has(key))) renderShapeControls();
});
renderShapeControls();

function sizeSolid(): void {
  const width = solidHost.clientWidth;
  solid.setSize(width, Math.max(260, Math.min(width * 1.1, window.innerHeight * 0.75)));
}
new ResizeObserver(sizeSolid).observe(solidHost);

// The set: which saved set it is, if any, and what it held when it was last opened or saved.
const openSelect = $<HTMLSelectElement>('set-open');
const nameInput = $<HTMLInputElement>('set-name');
const saveButton = $<HTMLButtonElement>('set-save');
const saveAsButton = $<HTMLButtonElement>('set-save-as');
const exportButton = $<HTMLButtonElement>('set-export');
const clearButton = $<HTMLButtonElement>('set-clear');
const deleteButton = $<HTMLButtonElement>('set-delete');
const status = $<HTMLOutputElement>('set-status');
const count = $<HTMLOutputElement>('set-count');
const grid = $<HTMLOListElement>('set-grid');
const exportBox = $('export');
const exportText = $<HTMLTextAreaElement>('export-text');

/** Key of the saved set being edited, or null for a new set. */
let editing: string | null = null;
let baseline: SavedSet = { title: '', colors: [] };
let message = '';

const title = () => nameInput.value.trim();
const current = (): SavedSet => ({ title: title() || UNTITLED, colors: [...selection.get()] });
const sameColors = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);
const isDirty = () => title() !== baseline.title || !sameColors(selection.get(), baseline.colors);

function fillOpenSelect(): void {
  openSelect.replaceChildren(new Option('New set', ''));
  for (const [key, set] of readSavedSets()) openSelect.append(new Option(set.title, key));
  // A set deleted in another tab is no longer saved; what is on screen stays, as a new set.
  if (editing && !readSavedSets().has(editing)) {
    editing = null;
    baseline = { title: '', colors: [] };
  }
  openSelect.value = editing ?? '';
}

function open(key: string | null): void {
  const set = key ? readSavedSets().get(key) : undefined;
  editing = set ? key : null;
  baseline = set ? { title: set.title, colors: set.colors.filter((id) => PAINTS.has(id)) } : { title: '', colors: [] };
  nameInput.value = baseline.title;
  message = '';
  selection.set(baseline.colors);
  openSelect.value = editing ?? '';
  render();
}

function save(asNew: boolean): void {
  const set = current();
  // Save As from a saved set under its own name would list two sets of that name.
  if (asNew && editing && set.title === baseline.title) set.title = `${set.title} (copy)`;
  const key = saveSet(asNew ? null : editing, set);
  if (!key) {
    message = 'Not saved: this browser does not allow the page to store data.';
    render();
    return;
  }
  editing = key;
  baseline = set;
  nameInput.value = set.title;
  message = asNew ? `Saved as “${set.title}”.` : 'Saved.';
  // Saving fires the change event, which refills the selects and redraws.
  fillOpenSelect();
  render();
}

openSelect.addEventListener('change', () => {
  const key = openSelect.value || null;
  if (isDirty() && selection.get().length > 0 && !confirm('Discard the changes to this set?')) {
    openSelect.value = editing ?? '';
    return;
  }
  open(key);
});
nameInput.addEventListener('input', () => {
  message = '';
  render();
});
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !saveButton.disabled) save(editing === null);
});
saveButton.addEventListener('click', () => save(editing === null));
saveAsButton.addEventListener('click', () => save(true));
clearButton.addEventListener('click', () => {
  const n = selection.get().length;
  if (n > 0 && confirm(`Take all ${n} paints out of the set?`)) selection.set([]);
});
deleteButton.addEventListener('click', () => {
  if (!editing || !confirm(`Delete “${baseline.title}” from this browser? The paints stay selected.`)) return;
  const was = baseline.title;
  deleteSet(editing);
  editing = null;
  baseline = { title: '', colors: [] };
  message = `Deleted “${was}”. Save As keeps these paints as a new set.`;
  fillOpenSelect();
  render();
});
exportButton.addEventListener('click', () => {
  exportBox.hidden = !exportBox.hidden;
  render();
  if (!exportBox.hidden) {
    exportText.focus();
    exportText.select();
  }
});
$('export-close').addEventListener('click', () => {
  exportBox.hidden = true;
  render();
  exportButton.focus();
});
exportText.addEventListener('focus', () => exportText.select());
$('export-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(exportText.value);
    message = 'Copied the JSON.';
  } catch {
    exportText.select();
    message = 'Could not copy; the JSON is selected, copy it with the keyboard.';
  }
  render();
});

// Clicking a paint in the set takes it out; hovering it shows it like any swatch.
grid.addEventListener('click', (e) => {
  const paint = paintAt(e.target);
  if (!paint) return;
  selection.remove([paint.id]);
  // The swatch under the pointer is gone, and no pointerleave will fire for it.
  showHover(null, 0, 0);
});
grid.addEventListener('pointermove', (e) => {
  const paint = paintAt(e.target);
  showHover(paint?.lab ?? null, e.clientX, e.clientY, paint ?? undefined);
});
grid.addEventListener('pointerleave', () => showHover(null, 0, 0));

function paintAt(target: EventTarget | null): Paint | null {
  const button = (target as Element | null)?.closest<HTMLButtonElement>('.picked-swatch');
  return (button && PAINTS.get(button.dataset.id!)) ?? null;
}

function renderGrid(): void {
  const ids = selection.get();
  const have = new Map([...grid.children].map((li) => [(li as HTMLElement).dataset.id!, li]));
  grid.replaceChildren(
    ...ids.map((id) => {
      const existing = have.get(id);
      if (existing) return existing;
      const paint = PAINTS.get(id)!;
      const li = document.createElement('li');
      li.className = 'picked';
      li.dataset.id = id;
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'picked-swatch';
      swatch.dataset.id = id;
      swatch.style.backgroundColor = paint.display;
      swatch.setAttribute('aria-label', `Remove ${paintLabel(paint)} from the set`);
      const name = document.createElement('span');
      name.className = 'picked-name';
      if (paint.code) {
        const code = document.createElement('span');
        code.className = 'mono picked-code';
        code.textContent = paint.code;
        name.append(code, ' ');
      }
      name.append(paint.pigment ? `${paint.name} · ${paint.pigment}` : paint.name);
      li.append(swatch, name);
      return li;
    }),
  );
}

function render(): void {
  const n = selection.get().length;
  const dirty = isDirty();
  count.value = `${n} paint${n === 1 ? '' : 's'}`;
  $('set-empty').hidden = n > 0;
  $('set-hint').hidden = n === 0;
  saveButton.disabled = n === 0 || (editing !== null && !dirty);
  saveAsButton.disabled = n === 0;
  deleteButton.disabled = editing === null;
  clearButton.disabled = n === 0;
  exportButton.setAttribute('aria-expanded', String(!exportBox.hidden));
  if (!exportBox.hidden) {
    const set = current();
    exportText.value = exportSet(editing ?? setKey(set.title, new Set([...SET_KEYS, ...readSavedSets().keys()])), set);
  }
  status.value =
    message ||
    (editing === null ? (n > 0 ? 'Not saved yet.' : '') : dirty ? 'Unsaved changes.' : 'Saved in this browser.');
  storeDraft();
}

selection.subscribe(() => {
  store.set({ paints: selection.get().map((id) => PAINTS.get(id)!) });
  message = '';
  renderGrid();
  render();
});

onSavedSetsChange(() => {
  for (const pane of panes) pane.refreshLayouts();
  fillOpenSelect();
  render();
});

function storeDraft(): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ editing, title: nameInput.value, colors: selection.get() }));
  } catch {
    // Without storage the draft is simply not kept.
  }
}

/** Restores the set that was on screen at the last visit. */
function restoreDraft(): void {
  let draft: { editing?: unknown; title?: unknown; colors?: unknown } = {};
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') ?? {};
  } catch {
    // No storage or a damaged draft: start empty.
  }
  const saved = readSavedSets();
  open(typeof draft.editing === 'string' && saved.has(draft.editing) ? draft.editing : null);
  if (typeof draft.title === 'string') nameInput.value = draft.title;
  if (Array.isArray(draft.colors)) selection.set(draft.colors.filter((id) => typeof id === 'string' && PAINTS.has(id)));
  render();
}

fillOpenSelect();
restoreDraft();
sizeSolid();
