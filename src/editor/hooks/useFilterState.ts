/**
 * Central state store for the filter editor.
 *
 * Uses Zustand for simple, direct state management consistent
 * with the main site's patterns.
 */

import { create } from 'zustand';
import type {
  FilterConfig,
  EffectType,
  EffectParams,
  LayerConfig,
  MotionConfig,
  EdgeStrategy,
} from '../types/filter-config';
import {
  DEFAULT_EFFECT_PARAMS,
  DEFAULT_LAYERS,
  DEFAULT_MOTION,
} from '../types/filter-config';

// ---------------------------------------------------------------------------
// Video entry (from manifest)
// ---------------------------------------------------------------------------

export interface VideoEntry {
  id: string;
  type: 'video' | 'image';
  src: string;
  depthSrc: string;
  depthMeta: string;
  thumb?: string;
  label?: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

export interface EditorState {
  // -- Video selection --
  videos: VideoEntry[];
  selectedVideoId: string | null;

  // -- Effect configuration --
  effectType: EffectType;
  effectParams: { [K in EffectType]: EffectParams[K] };

  // -- Layer segmentation --
  layers: LayerConfig[];

  // -- Motion config --
  motion: MotionConfig;

  // -- Edge handling --
  edgeStrategy: EdgeStrategy;
  overscanPadding: number;

  // -- Quality --
  quality: 'auto' | 'high' | 'medium' | 'low';

  // -- UI state --
  advancedMode: boolean;
  depthOverlayVisible: boolean;
  depthOverlayOpacity: number;
  layerOverlayVisible: boolean;
  filterName: string;
  filterDisplayName: string;

  // -- Displacement ball --
  inputX: number;
  inputY: number;
  inputMode: 'momentary' | 'latch';

  // -- Loading --
  isLoading: boolean;
  loadingMessage: string;

  // -- Export --
  isExporting: boolean;
  lastExportPath: string | null;
}

interface EditorActions {
  setVideos: (videos: VideoEntry[]) => void;
  selectVideo: (id: string) => void;
  setEffectType: (type: EffectType) => void;
  updateEffectParam: <K extends EffectType>(type: K, key: keyof EffectParams[K], value: EffectParams[K][keyof EffectParams[K]]) => void;
  setLayers: (layers: LayerConfig[]) => void;
  updateLayer: (index: number, updates: Partial<LayerConfig>) => void;
  setLayerCount: (count: number) => void;
  setMotion: (motion: Partial<MotionConfig>) => void;
  setEdgeStrategy: (strategy: EdgeStrategy) => void;
  setOverscanPadding: (padding: number) => void;
  setQuality: (quality: 'auto' | 'high' | 'medium' | 'low') => void;
  setAdvancedMode: (advanced: boolean) => void;
  setDepthOverlayVisible: (visible: boolean) => void;
  setDepthOverlayOpacity: (opacity: number) => void;
  setLayerOverlayVisible: (visible: boolean) => void;
  setFilterName: (name: string) => void;
  setFilterDisplayName: (name: string) => void;
  setInput: (x: number, y: number) => void;
  setInputMode: (mode: 'momentary' | 'latch') => void;
  setLoading: (loading: boolean, message?: string) => void;
  setExporting: (exporting: boolean) => void;
  setLastExportPath: (path: string | null) => void;
  getFilterConfig: () => FilterConfig;
  reset: () => void;
}

const INITIAL_STATE: EditorState = {
  videos: [],
  selectedVideoId: null,
  effectType: 'parallax',
  effectParams: { ...DEFAULT_EFFECT_PARAMS },
  layers: [...DEFAULT_LAYERS],
  motion: { ...DEFAULT_MOTION },
  edgeStrategy: 'fade',
  overscanPadding: 0.08,
  quality: 'auto',
  advancedMode: false,
  depthOverlayVisible: false,
  depthOverlayOpacity: 0.5,
  layerOverlayVisible: false,
  filterName: '',
  filterDisplayName: '',
  inputX: 0,
  inputY: 0,
  inputMode: 'momentary',
  isLoading: false,
  loadingMessage: '',
  isExporting: false,
  lastExportPath: null,
};

export const useEditorStore = create<EditorState & EditorActions>((set, get) => ({
  ...INITIAL_STATE,

  setVideos: (videos) => set({ videos }),

  selectVideo: (id) => set({ selectedVideoId: id }),

  setEffectType: (type) => set({ effectType: type }),

  updateEffectParam: (type, key, value) => set((state) => ({
    effectParams: {
      ...state.effectParams,
      [type]: {
        ...state.effectParams[type],
        [key]: value,
      },
    },
  })),

  setLayers: (layers) => set({ layers }),

  updateLayer: (index, updates) => set((state) => {
    const newLayers = [...state.layers];
    newLayers[index] = { ...newLayers[index], ...updates };
    return { layers: newLayers };
  }),

  setLayerCount: (count) => set((state) => {
    const clamped = Math.max(1, Math.min(8, count));
    const step = 1.0 / clamped;
    const labels = ['Foreground', 'Midground', 'Background', 'Far Background', 'Layer 5', 'Layer 6', 'Layer 7', 'Layer 8'];
    const newLayers: LayerConfig[] = Array.from({ length: clamped }, (_, i) => {
      const existing = state.layers[i];
      return {
        start: i * step,
        end: (i + 1) * step,
        intensity: existing?.intensity ?? (1.0 - (i / clamped) * 0.8),
        label: existing?.label ?? labels[i] ?? `Layer ${i + 1}`,
      };
    });
    return { layers: newLayers };
  }),

  setMotion: (motion) => set((state) => ({
    motion: { ...state.motion, ...motion },
  })),

  setEdgeStrategy: (edgeStrategy) => set({ edgeStrategy }),

  setOverscanPadding: (overscanPadding) => set({ overscanPadding }),

  setQuality: (quality) => set({ quality }),

  setAdvancedMode: (advancedMode) => set({ advancedMode }),

  setDepthOverlayVisible: (depthOverlayVisible) => set({ depthOverlayVisible }),

  setDepthOverlayOpacity: (depthOverlayOpacity) => set({ depthOverlayOpacity }),

  setLayerOverlayVisible: (layerOverlayVisible) => set({ layerOverlayVisible }),

  setFilterName: (filterName) => set({ filterName }),

  setFilterDisplayName: (filterDisplayName) => set({ filterDisplayName }),

  setInput: (inputX, inputY) => set({ inputX, inputY }),

  setInputMode: (inputMode) => set({ inputMode }),

  setLoading: (isLoading, loadingMessage = '') => set({ isLoading, loadingMessage }),

  setExporting: (isExporting) => set({ isExporting }),

  setLastExportPath: (lastExportPath) => set({ lastExportPath }),

  getFilterConfig: (): FilterConfig => {
    const s = get();
    const video = s.videos.find((v) => v.id === s.selectedVideoId);
    return {
      name: s.filterName || 'untitled',
      displayName: s.filterDisplayName || s.filterName || 'Untitled Filter',
      effectType: s.effectType,
      video: {
        id: video?.id ?? '',
        src: video?.src ?? '',
        depthSrc: video?.depthSrc ?? '',
        depthMeta: video?.depthMeta ?? '',
        type: video?.type ?? 'video',
      },
      layers: s.layers,
      effectParams: s.effectParams[s.effectType],
      motion: s.motion,
      edgeStrategy: s.edgeStrategy,
      overscanPadding: s.overscanPadding,
      quality: s.quality,
    };
  },

  reset: () => set({ ...INITIAL_STATE }),
}));
