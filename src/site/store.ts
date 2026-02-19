/**
 * Lightweight pub/sub state store — zero dependencies.
 *
 * Modelled after Zustand's API surface (getState / setState / subscribe)
 * but implemented in ~40 LOC with no React or framework coupling.
 */

export interface EffectManifestEntry {
  id: string;
  label: string;
  enabled: boolean;
}

export interface EffectsManifest {
  defaultEffect: string;
  effects: EffectManifestEntry[];
}

export interface VideoEntry {
  id: string;
  src: string;
  depthSrc: string;
  depthMeta: string;
}

/** Categorized video manifest: parallax videos for scene effects, textural for portal. */
export interface VideoManifest {
  parallax: VideoEntry[];
  textural: VideoEntry[];
}

export interface SiteState {
  activeEffect: string;
  effects: EffectManifestEntry[];
  videos: VideoManifest;
}

type Listener = (state: SiteState, prev: SiteState) => void;

export interface Store {
  getState: () => SiteState;
  setState: (partial: Partial<SiteState>) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createStore(initial: SiteState): Store {
  let state = { ...initial };
  const listeners = new Set<Listener>();

  return {
    getState: () => state,

    setState(partial) {
      const prev = state;
      state = { ...state, ...partial };
      listeners.forEach((fn) => fn(state, prev));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
