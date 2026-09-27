import type { Vec3 } from './color/oklab';

/** How the 3D solid is cut open to reveal the two slices. */
export type CutMode = 'whole' | 'lightness' | 'hue' | 'wedge';

export interface AppState {
  /** Lightness of the horizontal slice (view B.1). */
  L: number;
  /** Hue in degrees of the vertical slice (view B.2). Its complement h + 180° is shown too. */
  h: number;
  /** The color the user clicked, in OKLab. */
  pick: Vec3;
  /** The color under the pointer in any view, in OKLab, or null. */
  hover: Vec3 | null;
  cut: CutMode;
}

export type Listener = (state: AppState, changed: Set<keyof AppState>) => void;

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState>): void;
  subscribe(fn: Listener): () => void;
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
