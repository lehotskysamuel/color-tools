import type { AppState, Gamut, ShapeStyle, Store } from '../state';

/** A segmented control: a fieldset of radios whose checked value is written to the state. */
export interface Segmented {
  id: string;
  value: (s: AppState) => string;
  patch: (value: string) => Partial<AppState>;
}

/** Writes each control's choice to the store; returns the function that checks the radios that match the state. */
export function bindSegmented(store: Store, controls: readonly Segmented[]): () => void {
  for (const { id, patch } of controls) {
    for (const input of document.querySelectorAll<HTMLInputElement>(`#${id} input`)) {
      input.addEventListener('change', () => input.checked && store.set(patch(input.value)));
    }
  }
  return () => {
    const state = store.get();
    for (const { id, value } of controls) {
      const radio = document.querySelector<HTMLInputElement>(`#${id} input[value="${value(state)}"]`);
      if (radio) radio.checked = true;
    }
  };
}

/** The options of view A's two shapes, the color space and the paint hull. */
export const SHAPE_CONTROLS: readonly Segmented[] = [
  { id: 'gamut', value: (s) => s.gamut, patch: (v) => ({ gamut: v as Gamut }) },
  { id: 'gamut-style', value: (s) => s.gamutStyle, patch: (v) => ({ gamutStyle: v as ShapeStyle }) },
  { id: 'hull', value: (s) => (s.hull ? 'on' : 'off'), patch: (v) => ({ hull: v === 'on' }) },
  { id: 'hull-style', value: (s) => s.hullStyle, patch: (v) => ({ hullStyle: v as ShapeStyle }) },
];
