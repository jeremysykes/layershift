/**
 * Site state store — Zustand.
 *
 * Manages the landing page state: active effect, loaded effects manifest,
 * and video manifest. Components subscribe to slices via useSiteStore().
 */

import { create } from 'zustand';
import type {
  EffectManifestEntry,
  EffectsManifest,
  VideoEntry,
  VideoManifest,
} from './types';

// Re-export types for backwards compatibility
export type { EffectManifestEntry, EffectsManifest, VideoEntry, VideoManifest };

export interface SiteState {
  activeEffect: string;
  effects: EffectManifestEntry[];
  videos: VideoManifest;
  isInitialized: boolean;
}

interface SiteActions {
  setActiveEffect: (id: string) => void;
  initialize: (state: Pick<SiteState, 'activeEffect' | 'effects' | 'videos'>) => void;
}

export const useSiteStore = create<SiteState & SiteActions>((set) => ({
  activeEffect: 'parallax',
  effects: [],
  videos: { parallax: [], textural: [] },
  isInitialized: false,

  setActiveEffect: (id) => set({ activeEffect: id }),

  initialize: (state) =>
    set({
      activeEffect: state.activeEffect,
      effects: state.effects,
      videos: state.videos,
      isInitialized: true,
    }),
}));
