/** Reads the CSS color tokens so canvas drawing follows the light/dark theme. */

export interface Theme {
  surface: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  hatch: string;
  monoFont: string;
}

export function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    surface: v('--surface'),
    ink: v('--ink'),
    ink2: v('--ink-2'),
    ink3: v('--ink-3'),
    line: v('--line'),
    hatch: v('--hatch'),
    monoFont: v('--font-mono'),
  };
}

/** Calls `fn` whenever the effective theme may have changed (OS setting or a data-theme toggle). */
export function onThemeChange(fn: () => void): void {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
  new MutationObserver(fn).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  });
}
