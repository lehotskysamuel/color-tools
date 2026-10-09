import { DEFAULT_SORT, SORT_ORDERS, type SortOrder, isSortOrder } from '../paints/sort';

/** One order for every page, so the paints keep their order from page to page. */
const STORAGE_KEY = 'color-tools.sort';

/** The page's "Sort by" select: the order every paint grid on the page is shown in. */
export interface SortControl {
  get(): SortOrder;
  subscribe(fn: (order: SortOrder) => void): void;
}

/**
 * Fills a "Sort by" select with the orders and remembers the choice. A page without a printed order to keep
 * leaves out "As printed", and treats it as the default.
 */
export function bindSortSelect(select: HTMLSelectElement, { printed = true } = {}): SortControl {
  const orders = SORT_ORDERS.filter((o) => printed || o.id !== 'printed');
  for (const o of orders) select.append(new Option(o.label, o.id));
  const offered = (value: unknown): SortOrder =>
    isSortOrder(value) && orders.some((o) => o.id === value) ? value : DEFAULT_SORT;
  let order = offered(readStored());
  select.value = order;
  const listeners = new Set<(order: SortOrder) => void>();
  select.addEventListener('change', () => {
    order = offered(select.value);
    try {
      localStorage.setItem(STORAGE_KEY, order);
    } catch {
      // Storage can be unavailable (private mode, blocked site data); the choice just isn't remembered.
    }
    for (const fn of listeners) fn(order);
  });
  return {
    get: () => order,
    subscribe: (fn) => void listeners.add(fn),
  };
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
