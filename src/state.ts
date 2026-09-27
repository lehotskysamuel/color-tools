import { type Vec3, oklabToOklch } from './color/oklab';
import type { Paint } from './paints/vallejo';

/** How the 3D solid is cut open to reveal the two slices. */
export type CutMode = 'whole' | 'lightness' | 'hue' | 'wedge';

export interface AppState {
  /** Lightness of the horizontal slice (view B.1). */
  L: number;
  /** Hue in degrees of the vertical slice (view B.2). Its complement h + 180° is shown too. */
  h: number;
  /** The color the user clicked, in OKLab. */
  pick: Vec3;
  /** The paint the pick came from, or null when it was picked from the space itself. */
  pickPaint: Paint | null;
  /** Paints drawn as dots in the views. */
  paints: readonly Paint[];
  /** The color under the pointer in any view, in OKLab, or null. */
  hover: Vec3 | null;
  cut: CutMode;
  /** Draw the solid as a wire cage instead of an opaque surface, so everything inside it shows. */
  wireframe: boolean;
}

export type Listener = (state: AppState, changed: Set<keyof AppState>) => void;

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState>): void;
  subscribe(fn: Listener): () => void;
}

/** Picks a paint's exact color and moves both slices through it. */
export function pickPaint(store: Store, paint: Paint): void {
  const [L, C, h] = oklabToOklch(paint.lab);
  // A neutral has no hue; keep the hue slice where it is.
  store.set({ pick: paint.lab, pickPaint: paint, L, h: C > 1e-4 ? h : store.get().h });
}

export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const changed = new Set<keyof AppState>();
      for (const key of Object.keys(patch) as (keyof AppState)[]) {
        if (patch[key] !== state[key]) changed.add(key);
      }
      if (changed.size === 0) return;
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state, changed);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
