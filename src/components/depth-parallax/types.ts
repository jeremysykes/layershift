export interface DepthParallaxProps {
  src: string;
  depthSrc: string;
  depthMeta: string;
  parallaxX?: number;
  parallaxY?: number;
  parallaxMax?: number;
  layers?: number;
  overscan?: number;
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
export interface DepthParallaxReadyDetail {
  videoWidth: number;
  videoHeight: number;
  duration: number;
}

/** Fired when video starts playing. */
export interface DepthParallaxPlayDetail {
  currentTime: number;
}

/** Fired when video pauses. */
export interface DepthParallaxPauseDetail {
  currentTime: number;
}

/** Fired when video loops back to start. */
export interface DepthParallaxLoopDetail {
  loopCount: number;
}

/** Fired on each new video frame (via requestVideoFrameCallback when available). */
export interface DepthParallaxFrameDetail {
  currentTime: number;
  frameNumber: number;
}

/** Fired on initialization errors. */
export interface DepthParallaxErrorDetail {
  message: string;
}

/**
 * Map of all custom events dispatched by `<depth-parallax>`.
 *
 * Usage with addEventListener:
 * ```ts
 * el.addEventListener('depth-parallax:ready', (e) => {
 *   console.log(e.detail.videoWidth, e.detail.duration);
 * });
 * ```
 */
export interface DepthParallaxEventMap {
  'depth-parallax:ready': CustomEvent<DepthParallaxReadyDetail>;
  'depth-parallax:play': CustomEvent<DepthParallaxPlayDetail>;
  'depth-parallax:pause': CustomEvent<DepthParallaxPauseDetail>;
  'depth-parallax:loop': CustomEvent<DepthParallaxLoopDetail>;
  'depth-parallax:frame': CustomEvent<DepthParallaxFrameDetail>;
  'depth-parallax:error': CustomEvent<DepthParallaxErrorDetail>;
}
