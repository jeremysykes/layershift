export interface LayershiftProps {
  src: string;
  depthSrc: string;
  depthMeta: string;
  parallaxX?: number;
  parallaxY?: number;
  parallaxMax?: number;
  layers?: number;
  overscan?: number;
  /** Adaptive quality tier ('auto' | 'high' | 'medium' | 'low'). */
  quality?: 'auto' | 'high' | 'medium' | 'low';
  /** GPU backend preference ('auto' | 'webgpu' | 'webgl2'). Default: 'auto'. */
  gpuBackend?: 'auto' | 'webgpu' | 'webgl2';
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  style?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Custom Event Detail Types
// ---------------------------------------------------------------------------

/** Fired once after initialization completes successfully. */
export interface LayershiftReadyDetail {
  videoWidth: number;
  videoHeight: number;
  duration: number;
  /** Depth analysis profile (present when depth data was analyzed). */
  depthProfile?: import('../../depth-analysis').DepthProfile;
  /** Parameters derived from depth analysis (present when depth data was analyzed). */
  derivedParams?: import('../../depth-analysis').DerivedParallaxParams;
}

/** Fired when video starts playing. */
export interface LayershiftPlayDetail {
  currentTime: number;
}

/** Fired when video pauses. */
export interface LayershiftPauseDetail {
  currentTime: number;
}

/** Fired when video loops back to start. */
export interface LayershiftLoopDetail {
  loopCount: number;
}

/** Fired on each new video frame (via requestVideoFrameCallback when available). */
export interface LayershiftFrameDetail {
  currentTime: number;
  frameNumber: number;
}

/** Fired on initialization errors. */
export interface LayershiftErrorDetail {
  message: string;
}

/** Fired during depth model download with progress updates. */
export interface LayershiftModelProgressDetail {
  /** Bytes received so far. */
  receivedBytes: number;
  /** Total bytes (from Content-Length header), or null if unknown. */
  totalBytes: number | null;
  /** Download fraction 0–1 (0 if total is unknown). */
  fraction: number;
  /** Human-readable status label (e.g. "Downloading depth model…"). */
  label: string;
}

/**
 * Map of all custom events dispatched by `<layershift-parallax>`.
 *
 * Usage with addEventListener:
 * ```ts
 * el.addEventListener('layershift-parallax:ready', (e) => {
 *   console.log(e.detail.videoWidth, e.detail.duration);
 * });
 * ```
 */
export interface LayershiftEventMap {
  'layershift-parallax:ready': CustomEvent<LayershiftReadyDetail>;
  'layershift-parallax:play': CustomEvent<LayershiftPlayDetail>;
  'layershift-parallax:pause': CustomEvent<LayershiftPauseDetail>;
  'layershift-parallax:loop': CustomEvent<LayershiftLoopDetail>;
  'layershift-parallax:frame': CustomEvent<LayershiftFrameDetail>;
  'layershift-parallax:error': CustomEvent<LayershiftErrorDetail>;
  'layershift-parallax:model-progress': CustomEvent<LayershiftModelProgressDetail>;
}

// ---------------------------------------------------------------------------
// Portal Effect Types
// ---------------------------------------------------------------------------

/** Props for the <layershift-portal> Web Component. */
export interface LayershiftPortalProps {
  src: string;
  depthSrc: string;
  depthMeta: string;
  logoSrc: string;
  // Parallax
  parallaxX?: number;
  parallaxY?: number;
  parallaxMax?: number;
  overscan?: number;
  /** POM ray-march step count for interior displacement. */
  pomSteps?: number;
  /** Adaptive quality tier ('auto' | 'high' | 'medium' | 'low'). */
  quality?: 'auto' | 'high' | 'medium' | 'low';
  /** GPU backend preference ('auto' | 'webgpu' | 'webgl2'). Default: 'auto'. */
  gpuBackend?: 'auto' | 'webgpu' | 'webgl2';
  // Boundary effects
  rimIntensity?: number;
  rimColor?: string;
  rimWidth?: number;
  /** Refraction distortion strength. */
  refractionStrength?: number;
  /** Chromatic fringe strength. */
  chromaticStrength?: number;
  /** Volumetric occlusion intensity. */
  occlusionIntensity?: number;
  // Lens transform
  /** Lens depth power (< 1 = wide-angle). */
  depthPower?: number;
  /** Depth range scale factor. */
  depthScale?: number;
  /** Depth bias (negative = near bias). */
  depthBias?: number;
  // Interior mood
  /** Interior fog density. */
  fogDensity?: number;
  /** Interior fog color (hex string). */
  fogColor?: string;
  /** Color grading shift intensity. */
  colorShift?: number;
  /** Brightness bias adjustment. */
  brightnessBias?: number;
  // Depth-adaptive
  /** Depth contrast remap low. */
  contrastLow?: number;
  /** Depth contrast remap high. */
  contrastHigh?: number;
  /** Vertical parallax reduction factor. */
  verticalReduction?: number;
  /** Depth-of-field start distance. */
  dofStart?: number;
  /** Depth-of-field blur strength. */
  dofStrength?: number;
  // Bevel / dimensional typography
  /** Bevel shading intensity. */
  bevelIntensity?: number;
  /** Bevel effect width in distance field space. */
  bevelWidth?: number;
  /** Bevel darkening at edge. */
  bevelDarkening?: number;
  /** Bevel desaturation at edge. */
  bevelDesaturation?: number;
  /** Bevel light direction in degrees. */
  bevelLightAngle?: number;
  // Volumetric edge wall
  /** Volumetric edge wall thickness. */
  edgeThickness?: number;
  /** Edge wall specular intensity. */
  edgeSpecular?: number;
  /** Edge wall base color (hex string). */
  edgeColor?: string;
  // Chamfer geometry
  /** Chamfer width in normalized mesh coords (0 = no chamfer). */
  chamferWidth?: number;
  /** Chamfer angle in degrees (0 = face-forward, 90 = wall). */
  chamferAngle?: number;
  /** Chamfer base color (hex string). */
  chamferColor?: string;
  /** Chamfer ambient light level. */
  chamferAmbient?: number;
  /** Chamfer specular highlight intensity. */
  chamferSpecular?: number;
  /** Chamfer specular exponent (shininess). */
  chamferShininess?: number;
  // Edge occlusion (emissive interior)
  /** Edge occlusion ramp width. */
  edgeOcclusionWidth?: number;
  /** Edge occlusion strength (0 = none, 1 = full). */
  edgeOcclusionStrength?: number;
  /** 3D light direction as "x,y,z" string. */
  lightDirection?: string;
  // Video
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  style?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Portal Custom Event Detail Types
// ---------------------------------------------------------------------------

/** Fired once after portal initialization completes successfully. */
export interface LayershiftPortalReadyDetail {
  videoWidth: number;
  videoHeight: number;
  duration: number;
}

/** Fired when portal video starts playing. */
export interface LayershiftPortalPlayDetail {
  currentTime: number;
}

/** Fired when portal video pauses. */
export interface LayershiftPortalPauseDetail {
  currentTime: number;
}

/** Fired when portal video loops back to start. */
export interface LayershiftPortalLoopDetail {
  loopCount: number;
}

/** Fired on each new portal video frame. */
export interface LayershiftPortalFrameDetail {
  currentTime: number;
  frameNumber: number;
}

/** Fired on portal initialization errors. */
export interface LayershiftPortalErrorDetail {
  message: string;
}

/**
 * Map of all custom events dispatched by `<layershift-portal>`.
 *
 * Usage with addEventListener:
 * ```ts
 * el.addEventListener('layershift-portal:ready', (e) => {
 *   console.log(e.detail.videoWidth, e.detail.duration);
 * });
 * ```
 */
export interface LayershiftPortalEventMap {
  'layershift-portal:ready': CustomEvent<LayershiftPortalReadyDetail>;
  'layershift-portal:play': CustomEvent<LayershiftPortalPlayDetail>;
  'layershift-portal:pause': CustomEvent<LayershiftPortalPauseDetail>;
  'layershift-portal:loop': CustomEvent<LayershiftPortalLoopDetail>;
  'layershift-portal:frame': CustomEvent<LayershiftPortalFrameDetail>;
  'layershift-portal:error': CustomEvent<LayershiftPortalErrorDetail>;
  'layershift-portal:model-progress': CustomEvent<LayershiftModelProgressDetail>;
}

// ---------------------------------------------------------------------------
// Rack Focus Effect Types
// ---------------------------------------------------------------------------

/** Props for the <layershift-rack-focus> Web Component. */
export interface LayershiftRackFocusProps {
  src: string;
  depthSrc: string;
  depthMeta: string;
  depthModel?: string;
  sourceType?: 'video' | 'image' | 'camera';
  focusMode?: 'auto' | 'pointer' | 'scroll' | 'programmatic';
  focusDepth?: number;
  focusRange?: number;
  transitionSpeed?: number;
  aperture?: number;
  maxBlur?: number;
  depthScale?: number;
  highlightBloom?: boolean;
  highlightThreshold?: number;
  focusBreathing?: number;
  vignette?: number;
  quality?: 'auto' | 'high' | 'medium' | 'low';
  gpuBackend?: 'auto' | 'webgpu' | 'webgl2';
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  style?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Rack Focus Custom Event Detail Types
// ---------------------------------------------------------------------------

/** Fired once after rack focus initialization completes. */
export interface RackFocusReadyDetail {
  videoWidth: number;
  videoHeight: number;
  duration: number;
  depthProfile?: import('../../depth-analysis').DepthProfile;
  derivedFocusParams?: import('../../depth-analysis').DerivedFocusParams;
  initialFocusDepth: number;
}

/** Fired when the focus target changes. */
export interface RackFocusFocusChangeDetail {
  targetDepth: number;
  transitionDuration: number;
  source: 'pointer' | 'touch' | 'scroll' | 'api' | 'auto';
}

/** Fired when the spring settles at the target focus depth. */
export interface RackFocusFocusSettledDetail {
  focalDepth: number;
}

/** Fired when rack focus video starts playing. */
export interface RackFocusPlayDetail {
  currentTime: number;
}

/** Fired when rack focus video pauses. */
export interface RackFocusPauseDetail {
  currentTime: number;
}

/** Fired when rack focus video loops. */
export interface RackFocusLoopDetail {
  loopCount: number;
}

/** Fired on each new rack focus video frame. */
export interface RackFocusFrameDetail {
  currentTime: number;
  frameNumber: number;
}

/** Fired on rack focus initialization errors. */
export interface RackFocusErrorDetail {
  message: string;
}

/**
 * Map of all custom events dispatched by `<layershift-rack-focus>`.
 */
export interface LayershiftRackFocusEventMap {
  'layershift-rack-focus:ready': CustomEvent<RackFocusReadyDetail>;
  'layershift-rack-focus:focus-change': CustomEvent<RackFocusFocusChangeDetail>;
  'layershift-rack-focus:focus-settled': CustomEvent<RackFocusFocusSettledDetail>;
  'layershift-rack-focus:play': CustomEvent<RackFocusPlayDetail>;
  'layershift-rack-focus:pause': CustomEvent<RackFocusPauseDetail>;
  'layershift-rack-focus:loop': CustomEvent<RackFocusLoopDetail>;
  'layershift-rack-focus:frame': CustomEvent<RackFocusFrameDetail>;
  'layershift-rack-focus:error': CustomEvent<RackFocusErrorDetail>;
}
