/**
 * The page's two tabs: the set deep-dive and the set comparator. The comparator is #compare in the URL, so a
 * reload keeps it and the back button returns to the deep-dive.
 */
export type TabId = 'deepdive' | 'compare';

const HASH: Record<TabId, string> = { deepdive: '', compare: '#compare' };

const fromUrl = (): TabId => (location.hash === HASH.compare ? 'compare' : 'deepdive');

/** Wires the tab buttons (role="tab", data-tab, aria-controls) and calls `onShow` whenever a tab is shown. */
export function initTabs(onShow: (tab: TabId) => void): void {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

  const show = (id: TabId) => {
    for (const tab of tabs) {
      const selected = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')!)!.hidden = !selected;
    }
    onShow(id);
  };

  const select = (tab: HTMLButtonElement) => {
    const id = tab.dataset.tab as TabId;
    if (id === fromUrl()) return;
    history.pushState(null, '', HASH[id] || location.pathname + location.search);
    show(id);
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    // Arrow keys move between tabs and show them, as in the ARIA tabs pattern.
    tab.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : step ? i + step : null;
      if (next === null) return;
      e.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      select(target);
    });
  });
  window.addEventListener('popstate', () => show(fromUrl()));
  show(fromUrl());
}
