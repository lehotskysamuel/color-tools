/**
 * The atlas page's two views: the set deep-dive and the set comparator. Both are links of the page menu; the
 * comparator is #compare in the URL, so a reload keeps it and the back button returns to the deep-dive.
 */
export type ViewId = 'deepdive' | 'compare';

const HASH: Record<ViewId, string> = { deepdive: '', compare: '#compare' };
/** The page heading and the document title of each view. */
const TITLE: Record<ViewId, string> = { deepdive: 'OKLCh Atlas', compare: 'Set comparator' };

const fromUrl = (): ViewId => (location.hash === HASH.compare ? 'compare' : 'deepdive');

/**
 * Wires the menu links that name a view (data-view) to show its element (#page-<view>) without reloading, and
 * calls `onShow` whenever a view is shown.
 */
export function initViews(onShow: (view: ViewId) => void): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-view]')];
  const heading = document.getElementById('page-title')!;

  const show = (id: ViewId) => {
    for (const link of links) {
      const view = link.dataset.view as ViewId;
      if (view === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      document.getElementById(`page-${view}`)!.hidden = view !== id;
    }
    heading.textContent = TITLE[id];
    document.title = id === 'deepdive' ? TITLE.deepdive : `${TITLE[id]} · ${TITLE.deepdive}`;
    onShow(id);
  };

  for (const link of links) {
    link.addEventListener('click', (e) => {
      // A modified click opens the link in a new tab or window, as any link.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const id = link.dataset.view as ViewId;
      if (id === fromUrl()) return;
      history.pushState(null, '', HASH[id] || location.pathname + location.search);
      show(id);
    });
  }
  window.addEventListener('popstate', () => show(fromUrl()));
  show(fromUrl());
}
