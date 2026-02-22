/**
 * Filter config schema — defines the shape of an authored filter.
 *
 * This is the central data model for the editor. Every parameter the user
 * configures is captured here, and the export pipeline serializes it to JSON.
 */

// ---------------------------------------------------------------------------
// Effect types
// ---------------------------------------------------------------------------

export type EffectType = 'parallax' | 'tilt-shift' | 'foreground-glow' | 'rack-focus' | 'custom';

export const EFFECT_LABELS: Record<EffectType, string> = {
  'parallax': 'Parallax',
  'tilt-shift': 'Tilt Shift',
  'foreground-glow': 'Foreground Glow',
  'rack-focus': 'Rack Focus',
  'custom': 'Custom',
};

export const EFFECT_DESCRIPTIONS: Record<EffectType, string> = {
  'parallax': 'Per-pixel displacement based on depth. Near objects move more.',
  'tilt-shift': 'Simulates miniature/diorama look. Blurs regions outside a focal band.',
  'foreground-glow': 'Emissive highlight on near-depth layers. Depth determines glow mask.',
  'rack-focus': 'Animated focus shift from one depth layer to another over time.',
  'custom': 'Raw depth map with all parameters exposed for experimentation.',
};

// ---------------------------------------------------------------------------
// Layer definition
// ---------------------------------------------------------------------------

export interface LayerConfig {
  /** Depth threshold start (0-1). */
  start: number;
  /** Depth threshold end (0-1). */
  end: number;
  /** Displacement/effect intensity for this layer (0-1). */
  intensity: number;
  /** Label for display. */
  label: string;
}

// ---------------------------------------------------------------------------
// Effect-specific parameter sets
// ---------------------------------------------------------------------------

export interface ParallaxParams {
  strength: number;
  pomEnabled: boolean;
  pomSteps: number;
  contrastLow: number;
  contrastHigh: number;
  verticalReduction: number;
  dofStart: number;
  dofStrength: number;
}

export interface TiltShiftParams {
  /** Center of focal band in depth space (0-1). */
  focalCenter: number;
  /** Width of the in-focus band (0-1). */
  focalWidth: number;
  /** Max blur strength for out-of-focus regions. */
  blurStrength: number;
  /** Blur quality (number of taps). */
  blurSamples: number;
  /** Transition smoothness between focus/blur. */
  transitionSoftness: number;
}

export interface ForegroundGlowParams {
  /** Depth threshold below which glow applies (0-1, 0=near). */
  glowThreshold: number;
  /** Glow intensity multiplier. */
  glowIntensity: number;
  /** Glow color [r, g, b] each 0-1. */
  glowColor: [number, number, number];
  /** Glow spread/blur radius. */
  glowRadius: number;
  /** Edge softness of glow boundary. */
  edgeSoftness: number;
}

export interface RackFocusParams {
  /** Starting focus depth (0-1). */
  focusStart: number;
  /** Ending focus depth (0-1). */
  focusEnd: number;
  /** Duration of the rack in seconds. */
  rackDuration: number;
  /** Focal band width during rack. */
  focalWidth: number;
  /** Max blur for out-of-focus. */
  blurStrength: number;
  /** Whether to loop the rack animation. */
  loop: boolean;
}

export interface CustomParams {
  /** Raw shader code snippet for the effect function. */
  effectCode: string;
  /** Custom uniforms as key-value pairs. */
  uniforms: Record<string, number>;
}

export type EffectParams = {
  'parallax': ParallaxParams;
  'tilt-shift': TiltShiftParams;
  'foreground-glow': ForegroundGlowParams;
  'rack-focus': RackFocusParams;
  'custom': CustomParams;
};

// ---------------------------------------------------------------------------
// Motion source
// ---------------------------------------------------------------------------

export interface MotionConfig {
  /** Input mode for displacement. */
  mode: 'momentary' | 'latch';
  /** X-axis sensitivity multiplier. */
  sensitivityX: number;
  /** Y-axis sensitivity multiplier. */
  sensitivityY: number;
  /** Interpolation smoothing factor (0-1, lower = smoother). */
  lerpFactor: number;
}

// ---------------------------------------------------------------------------
// Edge handling
// ---------------------------------------------------------------------------

export type EdgeStrategy = 'fade' | 'clamp' | 'mirror' | 'wrap';

// ---------------------------------------------------------------------------
// Full filter config
// ---------------------------------------------------------------------------

export interface FilterConfig {
  /** Filter name (kebab-case, used for tag name: <layershift-{name}>). */
  name: string;
  /** Display name. */
  displayName: string;
  /** Effect type. */
  effectType: EffectType;
  /** Video source reference. */
  video: {
    id: string;
    src: string;
    depthSrc: string;
    depthMeta: string;
    type: 'video' | 'image';
  };
  /** Layer segmentation config. */
  layers: LayerConfig[];
  /** Effect-specific parameters. */
  effectParams: EffectParams[EffectType];
  /** Motion/input configuration. */
  motion: MotionConfig;
  /** Edge handling strategy. */
  edgeStrategy: EdgeStrategy;
  /** Overscan padding (UV space). */
  overscanPadding: number;
  /** Adaptive quality preference. */
  quality: 'auto' | 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Default configs
// ---------------------------------------------------------------------------

export const DEFAULT_PARALLAX_PARAMS: ParallaxParams = {
  strength: 0.05,
  pomEnabled: true,
  pomSteps: 16,
  contrastLow: 0.05,
  contrastHigh: 0.95,
  verticalReduction: 0.5,
  dofStart: 0.6,
  dofStrength: 0.4,
};

export const DEFAULT_TILT_SHIFT_PARAMS: TiltShiftParams = {
  focalCenter: 0.5,
  focalWidth: 0.3,
  blurStrength: 0.8,
  blurSamples: 8,
  transitionSoftness: 0.15,
};

export const DEFAULT_FOREGROUND_GLOW_PARAMS: ForegroundGlowParams = {
  glowThreshold: 0.4,
  glowIntensity: 0.6,
  glowColor: [1.0, 0.95, 0.85],
  glowRadius: 0.02,
  edgeSoftness: 0.1,
};

export const DEFAULT_RACK_FOCUS_PARAMS: RackFocusParams = {
  focusStart: 0.2,
  focusEnd: 0.8,
  rackDuration: 3.0,
  focalWidth: 0.2,
  blurStrength: 0.8,
  loop: true,
};

export const DEFAULT_CUSTOM_PARAMS: CustomParams = {
  effectCode: '',
  uniforms: {},
};

export const DEFAULT_EFFECT_PARAMS: { [K in EffectType]: EffectParams[K] } = {
  'parallax': DEFAULT_PARALLAX_PARAMS,
  'tilt-shift': DEFAULT_TILT_SHIFT_PARAMS,
  'foreground-glow': DEFAULT_FOREGROUND_GLOW_PARAMS,
  'rack-focus': DEFAULT_RACK_FOCUS_PARAMS,
  'custom': DEFAULT_CUSTOM_PARAMS,
};

export const DEFAULT_LAYERS: LayerConfig[] = [
  { start: 0.0, end: 0.33, intensity: 1.0, label: 'Foreground' },
  { start: 0.33, end: 0.66, intensity: 0.5, label: 'Midground' },
  { start: 0.66, end: 1.0, intensity: 0.2, label: 'Background' },
];

export const DEFAULT_MOTION: MotionConfig = {
  mode: 'momentary',
  sensitivityX: 0.4,
  sensitivityY: 1.0,
  lerpFactor: 0.08,
};
